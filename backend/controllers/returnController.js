// the above part is complete now do more validation and things at saturday ,13-12-2025





// controllers/shipmentReturnController.js
import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { createDelhiveryReturnShipment } from "../middlewares/services/delhiveryService.js";
import { uploadToCloudinary } from "../middlewares/upload.js";
import { sendEmail } from "../middlewares/utils/emailService.js";
import { addRefundJob } from "../middlewares/services/refundQueue.js";


export const RETURN_REASON_RULES = {
    DAMAGED: { imagesRequired: true },
    WRONG_ITEM: { imagesRequired: true },
    EXPIRED: { imagesRequired: true },
    QUALITY_ISSUE: { imagesRequired: true },
    SIZE_ISSUE: { imagesRequired: false },
    NO_LONGER_NEEDED: { imagesRequired: false }
};


const MAX_IMAGES_PER_ITEM = 5;



// ✅ Helper to validate ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ---------------------- USER ENDPOINTS ----------------------

export const requestShipmentReturn = async (req, res) => {
    try {
        const userId = req.user._id;
        const { shipmentId } = req.params;

        if (req.body.items && typeof req.body.items === "string") {
            try {
                req.body.items = JSON.parse(req.body.items);
            } catch {
                return res.status(400).json({ success: false, message: "Invalid JSON for items" });
            }
        }

        // convert req.files (array) → object grouped by fieldname
        function groupFilesByField(filesArray) {
            const grouped = {};
            for (const f of filesArray || []) {
                if (!grouped[f.fieldname]) grouped[f.fieldname] = [];
                grouped[f.fieldname].push(f);
            }
            return grouped;
        }

        if (Array.isArray(req.body.items)) {
            req.body.items = req.body.items.map(it => ({
                ...it,
                productId: String(it.productId)
            }));
        }

        const {
            items,
            reason,
            reasonDescription = "",
            type
        } = req.body;

        // -------------------------------
        // 1. VALIDATION
        // -------------------------------
        if (!["return", "replace"].includes(type)) {
            return res.status(400).json({ success: false, message: "Invalid return type" });
        }

        if (!shipmentId) {
            return res.status(400).json({ success: false, message: "shipmentId  is required" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Items are required" });
        }

        // -------------------------------
        // 2. FIND ORDER + SHIPMENT
        // -------------------------------
        const order = await Order.findOne({ "shipments._id": shipmentId });
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.id(shipmentId);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        // OWNERSHIP CHECK
        if (order.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not your shipment" });
        }

        // MUST BE DELIVERED
        if (shipment.status !== "Delivered") {
            return res.status(400).json({
                success: false,
                message: "Returns allowed only after delivery"
            });
        }

        // RETURN WINDOW CHECK
        const deliveredAt = new Date(shipment.deliveredAt);
        const allowedDays = order.returnPolicy?.days || 7;
        const diffDays = Math.floor((Date.now() - deliveredAt) / 86400000);

        if (diffDays > allowedDays) {
            return res.status(400).json({
                success: false,
                message: `Return window expired (${allowedDays} days)`
            });
        }

        // -------------------------------
        // 3. VALIDATE EACH ITEM
        // -------------------------------
        const validatedItems = [];

        for (const item of items) {
            const { productId, quantity, variant, condition } = item;

            if (!productId || !quantity || quantity <= 0) {
                return res.status(400).json({ success: false, message: "Invalid item" });
            }

            // Must belong to this shipment
            const found = shipment.products.find(p =>
                p.productId.toString() === productId &&
                (!variant || p.variant?.sku === variant.sku)
            );
            if (!found) {
                return res.status(400).json({
                    success: false,
                    message: "Item does not belong to shipment"
                });
            }

            // QUANTITY ABUSE PROTECTION
            const alreadyReturnedQty = shipment.returns
                ?.filter(r => r.status !== "cancelled")
                .flatMap(r => r.items)
                .filter(i =>
                    i.productId.toString() === productId &&
                    (!variant || i.variant?.sku === variant.sku)
                )
                .reduce((sum, i) => sum + i.quantity, 0) || 0;

            if (alreadyReturnedQty + quantity > found.quantity) {
                return res.status(400).json({
                    success: false,
                    message: "Return quantity exceeds purchase quantity"
                });
            }

            // DUPLICATE ACTIVE RETURN CHECK FOR SAME ITEM
            const active = shipment.returns?.some(r =>
                ["requested", "pickup_scheduled", "in_transit", "pickup_pending"].includes(r.status) &&
                r.items.some(i =>
                    i.productId.toString() === productId &&
                    (!variant || i.variant?.sku === variant.sku)
                )
            );

            if (active) {
                return res.status(400).json({
                    success: false,
                    message: "Return already requested for this item"
                });
            }

            // -------------------------------
            // IMAGE HANDLING
            // -------------------------------
            // convert req.files array → { images_<productId>: [files] }
            const groupedFiles = groupFilesByField(req.files);

            const fieldKey = `images_${productId}`;
            let uploadedImages = [];

            if (groupedFiles[fieldKey]) {
                const imgs = groupedFiles[fieldKey];

                if (imgs.length > 5) {
                    return res.status(400).json({
                        success: false,
                        message: "Max 5 images allowed"
                    });
                }

                for (const img of imgs) {
                    const result = await uploadToCloudinary(
                        img.buffer,
                        `returns/${shipmentId}/${productId}`
                    );
                    uploadedImages.push(result.secure_url ?? result);
                }
            }


            // IMAGE REQUIRED RULES
            const rule = RETURN_REASON_RULES[reason];
            if (rule?.imagesRequired && uploadedImages.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `Images required for reason: ${reason}`
                });
            }

            validatedItems.push({
                _id: new mongoose.Types.ObjectId(),
                productId,
                quantity,
                ...(variant ? { variant } : {}),
                reason,
                reasonDescription,
                images: uploadedImages,
                condition: condition || "Unopened"
            });
        }

        // -------------------------------
        // 4. CREATE RETURN ENTRY
        // -------------------------------
        const returnEntry = {
            _id: new mongoose.Types.ObjectId(),
            status: "requested",
            type,

            items: validatedItems,
            tracking_history: [],

            qc: {
                status: null,
                notes: "",
                images: []
            },

            refund: {
                amount: 0,
                status: "pending"
            },

            audit_trail: [
                {
                    status: "requested",
                    action: type === "replace" ? "replacement_requested" : "return_requested",
                    performedBy: userId,
                    performedByModel: "User",
                    timestamp: new Date(),
                    notes: reasonDescription
                }
            ],

            requestedBy: userId,
            requestedAt: new Date(),
            reason,
            description: reasonDescription
        };

        shipment.returns = shipment.returns || [];
        shipment.returns.push(returnEntry);

        // UPDATE ANALYTICS
        order.returnStats.totalReturns += 1;
        if (type === "replace") order.returnStats.totalReplacements += 1;

        await order.save();

        return res.status(201).json({
            success: true,
            message: type === "replace"
                ? "Replacement request submitted"
                : "Return request submitted",
            returnId: returnEntry._id,
            data: returnEntry
        });

    } catch (err) {
        console.error("Return Request Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const getMyShipmentReturns = async (req, res) => {
    try {
        const userId = req.user._id;

        const orders = await Order.find({
            user: userId,
            "shipments.returns.0": { $exists: true }
        })
            .select("shipments createdAt")
            .sort({ createdAt: -1 });

        const flattened = [];

        for (const o of orders) {
            for (const s of o.shipments || []) {
                if (!s.returns?.length) continue;

                for (const r of s.returns) {
                    flattened.push({
                        shipmentId: s._id,          // ✅ shipment mongo id
                        returnId: r._id,            // ✅ return mongo id
                        return: r
                    });
                }
            }
        }

        return res.json({ success: true, data: flattened });

    } catch (err) {
        console.error("getMyShipmentReturns Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};


export const getShipmentReturnDetails = async (req, res) => {
    try {
        const { shipmentId, returnId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
            return res.status(400).json({ success: false, message: "Invalid shipmentId" });
        }

        if (!mongoose.Types.ObjectId.isValid(returnId)) {
            return res.status(400).json({ success: false, message: "Invalid returnId" });
        }

        // ✅ Correct query
        const order = await Order.findOne({
            "shipments._id": shipmentId
        }).populate("user", "name email");

        if (!order) {
            return res.status(404).json({ success: false, message: "Shipment not found" });
        }

        // ✅ Correct shipment lookup
        const shipment = order.shipments.find(
            s => String(s._id) === String(shipmentId)
        );

        if (!shipment) {
            return res.status(404).json({ success: false, message: "Shipment not found" });
        }

        // ✅ Correct return lookup
        const ret = shipment.returns.id(returnId);

        if (!ret) {
            return res.status(404).json({ success: false, message: "Return not found" });
        }

        // ✅ Authorization
        if (
            req.user &&
            order.user._id.toString() !== req.user._id.toString() &&
            !(req.admin && req.admin._id)
        ) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        return res.json({
            success: true,
            data: {
                shipmentId: shipment._id,
                returnId: ret._id,
                return: ret
            }
        });

    } catch (err) {
        console.error("getShipmentReturnDetails Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

export const cancelShipmentReturn = async (req, res) => {
    try {
        const { shipmentId, returnId } = req.params;
        const userId = req.user?._id;

        // -------------------------------
        // 1. Find Order + Shipment
        // -------------------------------
        const order = await Order.findOne({ "shipments._id": shipmentId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found."
            });
        }

        const shipment = order.shipments.id(shipmentId);
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found."
            });
        }

        // Must be user’s own order
        if (order.user.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Not allowed to cancel return for this shipment."
            });
        }

        // -------------------------------
        // 2. Find Return Entry
        // -------------------------------
        const ret = shipment.returns.id(returnId);
        if (!ret) {
            return res.status(404).json({
                success: false,
                message: "Return request not found."
            });
        }

        // -------------------------------
        // 3. Already Cancelled
        // -------------------------------
        if (ret.status === "cancelled") {
            return res.json({
                success: true,
                message: "Return request already cancelled."
            });
        }

        // -------------------------------
        // 4. Non-Cancelable Stages
        // return flow: requested → approved → pickup_scheduled → picked_up → in_transit → delivered_to_warehouse → qc_passed/qc_failed
        // -------------------------------
        const nonCancelable = [
            "approved",
            "pickup_scheduled",
            "picked_up",
            "in_transit",
            "delivered_to_warehouse",
            "qc_passed",
            "qc_failed"
        ];

        if (nonCancelable.includes(ret.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel return at stage '${ret.status}'.`
            });
        }

        // Only "requested" can be cancelled
        if (ret.status !== "requested") {
            return res.status(400).json({
                success: false,
                message: "Return cannot be cancelled now."
            });
        }

        // -------------------------------
        // 5. Apply Cancellation
        // -------------------------------
        ret.status = "cancelled";
        ret.cancelledAt = new Date();

        // Add audit trail entry
        ret.audit_trail.push({
            status: "cancelled",
            action: "return_cancelled",
            performedBy: userId,
            performedByModel: "User",
            timestamp: new Date(),
            notes: "User cancelled return request"
        });

        // Reduce analytics
        order.returnStats.totalReturns = Math.max(order.returnStats.totalReturns - 1, 0);

        await order.save();

        return res.json({
            success: true,
            message: "Return request cancelled successfully.",
            data: ret
        });

    } catch (err) {
        console.error("Cancel Return Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};


export const getAllReturnsForAdmin = async (req, res) => {
    try {
        const { status, type, orderId, shipment_id } = req.query;

        const matchStage = {};

        if (orderId) matchStage.orderId = orderId;
        if (shipment_id) matchStage["shipments.shipment_id"] = shipment_id;
        if (type) matchStage["shipments.returns.type"] = type;
        if (status) matchStage["shipments.returns.status"] = status;

        const returns = await Order.aggregate([
            { $match: matchStage },

            // Order → Shipments
            { $unwind: "$shipments" },

            // Shipments → Returns
            { $unwind: "$shipments.returns" },

            // FILTER AFTER UNWIND
            {
                $match: {
                    ...(status && { "shipments.returns.status": status }),
                    ...(type && { "shipments.returns.type": type }),
                    ...(shipment_id && { "shipments.shipment_id": shipment_id })
                }
            },

            // POPULATE USER
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: "$user" },

            // FORMAT RESPONSE
            {
                $project: {
                    // ORDER
                    orderId: 1,
                    orderNumber: 1,
                    orderStatus: 1,
                    paymentStatus: 1,
                    createdAt: 1,

                    user: {
                        _id: "$user._id",
                        name: "$user.name",
                        email: "$user.email",
                        phone: "$user.phone"
                    },

                    // SHIPMENT
                    shipment: {
                        shipment_id: "$shipments.shipment_id",
                        status: "$shipments.status",
                        deliveredAt: "$shipments.deliveredAt",
                        awb_code: "$shipments.waybill",
                        courier_name: "$shipments.courier_name"
                    },

                    // RETURN
                    return: {
                        _id: "$shipments.returns._id",
                        type: "$shipments.returns.type",
                        status: "$shipments.returns.status",
                        reason: "$shipments.returns.reason",
                        description: "$shipments.returns.description",
                        requestedAt: "$shipments.returns.requestedAt",

                        items: "$shipments.returns.items",

                        qc: "$shipments.returns.qc",
                        refund: "$shipments.returns.refund",
                        tracking_history: "$shipments.returns.tracking_history",
                        audit_trail: "$shipments.returns.audit_trail"
                    }
                }
            },

            // SORT – newest first
            { $sort: { "return.requestedAt": -1 } }
        ]);

        return res.status(200).json({
            success: true,
            total: returns.length,
            data: returns
        });

    } catch (err) {
        console.error("Admin Return Fetch Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch return requests"
        });
    }
};

export const approveShipmentReturn = async (req, res) => {
    try {
        const { shipmentId, returnId } = req.params;
        const adminId = req.admin?._id;

        // 1. VALIDATION
        if (!shipmentId || !returnId) {
            return res.status(400).json({ success: false, message: "shipmentId & returnId are required" });
        }

        // 2. FETCH ORDER & SHIPMENT
        const order = await Order.findOne({ "shipments._id": shipmentId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order/shipment not found" });
        }

        const shipment = order.shipments.id(shipmentId);
        if (!shipment) {
            return res.status(404).json({ success: false, message: "Shipment not found" });
        }

        const returnReq = shipment.returns.id(returnId);
        if (!returnReq) {
            return res.status(404).json({ success: false, message: "Return request not found" });
        }

        if (returnReq.status !== "requested") {
            return res.status(400).json({ success: false, message: "Return request already processed" });
        }

        // 3. PREPARE PICKUP ADDRESS (Handle different structures)
        const shippingAddress = order.shippingAddress;

        // If shippingAddress is a string, convert to object
        let pickupAddress;
        if (typeof shippingAddress === 'string') {
            pickupAddress = {
                address: shippingAddress,
                name: order.customerName || "Customer",
                phone: order.shippingAddress?.phone || "0000000000",
                email: order.user?.email || "customer@example.com",
                city: "", // You might need to parse this from the string
                state: "",
                pincode: ""
            };
        } else if (shippingAddress && typeof shippingAddress === 'object') {
            // Normalize the address object
            pickupAddress = {
                name: shippingAddress.name || order.customerName || "Customer",
                // Try multiple possible address fields
                address: shippingAddress.address ||
                    shippingAddress.street ||
                    shippingAddress.addressLine1 ||
                    shippingAddress.fullAddress ||
                    "",
                city: shippingAddress.city || "",
                state: shippingAddress.state || "",
                pincode: shippingAddress.pincode || shippingAddress.zipCode || "",
                phone: shippingAddress.phone || shippingAddress.mobile || "",
                email: shippingAddress.email || order.user?.email || "customer@example.com"
            };
        } else {
            return res.status(400).json({
                success: false,
                message: "Shipping address is missing or invalid"
            });
        }

        // // 4. WAREHOUSE ADDRESS
        // const warehouseAddress = {
        //     name: "Joyory_Warehouse",
        //     address: "504-A, Synergy Tower, Corporate Rd, Next to Vodafone House, Near L&T Construction, Prahlad Nagar, Ahmedabad, Gujarat 380015",
        //     city: "Ahmedabad",
        //     state: "Gujarat",
        //     pincode: "380015",
        //     phone: "7990032368",
        //     email: process.env.WAREHOUSE_EMAIL || "joyory2025@gmail.com",
        //     country: "India"
        // };

        const warehouseAddress = JSON.parse(process.env.WAREHOUSE_JSON);

        if (
            !warehouseAddress?.name ||
            !warehouseAddress?.address ||
            !warehouseAddress?.city ||
            !warehouseAddress?.state ||
            !warehouseAddress?.pincode ||
            !warehouseAddress?.phone
        ) {
            throw new Error("WAREHOUSE_JSON is missing required fields");
        }

        // 5. CREATE DELHIVERY REVERSE SHIPMENT
        let reverseShipment;
        try {
            reverseShipment = await createDelhiveryReturnShipment({
                order,
                shipment,
                returnItems: returnReq.items,
                pickupAddress: pickupAddress, // Use the normalized address
                warehouseAddress: JSON.parse(process.env.WAREHOUSE_JSON),
            });
        } catch (err) {
            console.error("🔴 Delhivery API Error:", err.message);
            return res.status(502).json({
                success: false,
                message: "Failed to create Delhivery reverse pickup",
                error: err.message,
                debug: { pickupAddress, warehouseAddress }
            });
        }

        // 6. UPDATE RETURN REQUEST
        returnReq.status = "pickup_scheduled";
        returnReq.waybill = reverseShipment.waybill;
        returnReq.delhivery_reverse_pickup_id = reverseShipment.delhivery_reverse_pickup_id;
        returnReq.tracking_url = reverseShipment.tracking_url;

        // Store the pickup details for reference
        returnReq.pickup_details = {
            name: pickupAddress.name,
            address: pickupAddress.address,
            city: pickupAddress.city,
            state: pickupAddress.state,
            pincode: pickupAddress.pincode,
            phone: pickupAddress.phone,
            email: pickupAddress.email
        };

        returnReq.tracking_history.push({
            status: "pickup_scheduled",
            timestamp: new Date(),
            description: "Reverse pickup scheduled with Delhivery",
            location: `${pickupAddress.city}, ${pickupAddress.state}`
        });

        returnReq.audit_trail.push(
            {
                status: "approved",
                action: "return_approved",
                performedBy: adminId,
                performedByModel: "Admin",
                timestamp: new Date(),
                notes: `Delhivery waybill: ${reverseShipment.waybill}`
            }
        );

        await order.save();

        return res.json({
            success: true,
            message: "Return approved & reverse pickup scheduled",
            return: {
                waybill: returnReq.waybill,
                tracking_url: returnReq.tracking_url,
                status: returnReq.status
            }
        });

    } catch (err) {
        console.error("Approve Return Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
};

export const markShipmentReturnReceived = async (req, res) => {
    try {
        const { shipment_id, returnId } = req.params;

        const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        if (["received_at_warehouse", "refunded"].includes(ret.overallStatus)) {
            return res.status(400).json({ success: false, message: "Already processed" });
        }

        ret.overallStatus = "received_at_warehouse";
        ret.receivedAt = new Date();

        if (!ret.auditTrail) ret.auditTrail = [];
        if (!ret.timeline) ret.timeline = [];

        // Audit
        ret.auditTrail.push({
            status: "received_at_warehouse",
            action: "admin_mark_received",
            performedBy: req.admin._id,
            performedByModel: "Admin",
            timestamp: new Date(),
            notes: req.body?.notes || "Received at warehouse"
        });

        // Timeline
        ret.timeline.push({
            status: "received_at_warehouse",
            timestamp: new Date(),
            location: "Warehouse",
            description: req.body?.notes || "Return received at warehouse"
        });

        await order.save();

        // Add refund job
        await addRefundJob(order._id, {
            shipment_id: shipment.shipment_id,
            returnId: ret._id,
            amount: ret.refund?.amount || order.amount
        });

        // Notify customer
        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                `Return Received`,
                `<p>Your returned item(s) for Shipment #${shipment.shipment_id} were received.</p>`
            );
        }

        return res.json({ success: true, message: "Return received – refund initiated" });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const rejectShipmentReturn = async (req, res) => {
    try {
        const { shipmentId, returnId } = req.params;
        const adminId = req.admin?._id;
        const reason = req.body?.reason;

        // -------------------------------
        // 1. VALIDATION
        // -------------------------------
        if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required"
            });
        }

        if (!shipmentId || !returnId) {
            return res.status(400).json({
                success: false,
                message: "shipmentId & returnId are required"
            });
        }

        // -------------------------------
        // 2. FETCH ORDER + SHIPMENT
        // -------------------------------
        const order = await Order.findOne({ "shipments._id": shipmentId }).populate("user");

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order / Shipment not found"
            });
        }

        const shipment = order.shipments.id(shipmentId);
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found"
            });
        }

        // -------------------------------
        // 3. FETCH RETURN REQUEST
        // -------------------------------
        const ret = shipment.returns.id(returnId);
        if (!ret) {
            return res.status(404).json({
                success: false,
                message: "Return request not found"
            });
        }

        // -------------------------------
        // 4. STATUS GATING (STRICT)
        // -------------------------------
        if (ret.status !== "requested") {
            return res.status(400).json({
                success: false,
                message: `Cannot reject return at stage '${ret.status}'`
            });
        }

        // -------------------------------
        // 5. UPDATE RETURN STATUS
        // -------------------------------
        ret.status = "cancelled";
        ret.cancelledAt = new Date();

        // -------------------------------
        // 6. TRACKING HISTORY
        // -------------------------------
        ret.tracking_history.push({
            status: "cancelled",
            timestamp: new Date(),
            location: "Admin Panel",
            description: `Return rejected by admin: ${reason}`
        });

        // -------------------------------
        // 7. AUDIT TRAIL
        // -------------------------------
        ret.audit_trail.push({
            status: "cancelled",
            action: "admin_rejected",
            performedBy: adminId,
            performedByModel: "Admin",
            timestamp: new Date(),
            notes: reason
        });

        // -------------------------------
        // 8. ANALYTICS UPDATE
        // -------------------------------
        order.returnStats.totalReturns = Math.max(order.returnStats.totalReturns - 1, 0);

        // -------------------------------
        // 9. SAVE ORDER
        // -------------------------------
        await order.save();

        // -------------------------------
        // 10. OPTIONAL EMAIL NOTIFICATION
        // -------------------------------
        try {
            if (order.user?.email) {
                await sendEmail(
                    order.user.email,
                    "Return Request Rejected",
                    `
                        <p>Your return request for shipment <b>${shipmentId}</b> has been rejected.</p>
                        <p><b>Reason:</b> ${reason}</p>
                    `
                );
            }
        } catch (emailErr) {
            console.warn("Email sending failed (ignored):", emailErr.message);
        }

        return res.json({
            success: true,
            message: "Return request rejected successfully.",
            data: {
                returnId,
                shipmentId,
                status: ret.status,
                reason
            }
        });

    } catch (err) {
        console.error("❌ rejectShipmentReturn Error:", err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};


export const getReturnsSummary = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            type,
            reason,
            search,
            sortBy = "requestedAt",
            sortOrder = "desc"
        } = req.query;

        const skip = (page - 1) * limit;
        const sortDir = sortOrder === "asc" ? 1 : -1;

        /* ---------------- COMMON MATCH ---------------- */
        const match = {
            "shipments.returns": { $exists: true, $ne: [] }
        };

        if (status) match["shipments.returns.status"] = status;
        if (type) match["shipments.returns.type"] = type;
        if (reason) match["shipments.returns.items.reason"] = reason;

        if (search) {
            match.$or = [
                { orderId: { $regex: search, $options: "i" } },
                { customOrderId: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } }
            ];
        }

        const pipeline = [
            { $match: match },
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },

            {
                $project: {
                    returnId: "$shipments.returns._id",
                    status: "$shipments.returns.status",
                    type: "$shipments.returns.type",
                    reason: {
                        $ifNull: [
                            { $arrayElemAt: ["$shipments.returns.items.reason", 0] },
                            "Not Provided"
                        ]
                    },
                    requestedAt: "$shipments.returns.createdAt",

                    refundAmount: "$shipments.returns.refund.amount",

                    orderId: 1,
                    customOrderId: 1,
                    customerName: 1,

                    shipmentId: "$shipments._id",
                    awb: "$shipments.waybill",

                    totalItems: { $size: "$shipments.returns.items" }
                }
            },

            {
                $facet: {
                    /* ---------- LIST DATA ---------- */
                    data: [
                        { $sort: { [sortBy]: sortDir } },
                        { $skip: skip },
                        { $limit: Number(limit) }
                    ],

                    /* ---------- COUNT ---------- */
                    totalCount: [
                        { $count: "total" }
                    ],

                    /* ---------- SUMMARY ---------- */
                    summary: [
                        {
                            $group: {
                                _id: null,
                                totalReturns: { $sum: 1 },
                                totalRefundAmount: { $sum: "$refundAmount" },

                                status: { $push: "$status" },
                                type: { $push: "$type" },
                                reason: { $push: "$reason" }
                            }
                        },
                        {
                            $project: {
                                totalReturns: 1,
                                totalRefundAmount: 1,

                                statusBreakdown: {
                                    $arrayToObject: {
                                        $map: {
                                            input: { $setUnion: "$status" },
                                            as: "s",
                                            in: {
                                                k: "$$s",
                                                v: {
                                                    $size: {
                                                        $filter: {
                                                            input: "$status",
                                                            as: "x",
                                                            cond: { $eq: ["$$x", "$$s"] }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },

                                typeBreakdown: {
                                    $arrayToObject: {
                                        $map: {
                                            input: { $setUnion: "$type" },
                                            as: "t",
                                            in: {
                                                k: "$$t",
                                                v: {
                                                    $size: {
                                                        $filter: {
                                                            input: "$type",
                                                            as: "x",
                                                            cond: { $eq: ["$$x", "$$t"] }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },

                                reasonBreakdown: {
                                    $arrayToObject: {
                                        $map: {
                                            input: { $setUnion: "$reason" },
                                            as: "r",
                                            in: {
                                                k: "$$r",
                                                v: {
                                                    $size: {
                                                        $filter: {
                                                            input: "$reason",
                                                            as: "x",
                                                            cond: { $eq: ["$$x", "$$r"] }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        ];

        const [result] = await Order.aggregate(pipeline);

        const total = result.totalCount[0]?.total || 0;
        const summary = result.summary[0] || {
            totalReturns: 0,
            totalRefundAmount: 0,
            statusBreakdown: {},
            typeBreakdown: {},
            reasonBreakdown: {}
        };

        res.json({
            success: true,
            data: {
                returns: result.data,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / limit)
                },
                summary
            }
        });

    } catch (err) {
        console.error("Returns summary error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch returns summary"
        });
    }
};

export const getReturnDetails = async (req, res) => {
    try {
        const returnId = new mongoose.Types.ObjectId(req.params.returnId);

        const pipeline = [
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },

            // ✅ MATCH AFTER UNWIND
            {
                $match: {
                    "shipments.returns._id": returnId
                }
            },
            /* ---------- USER ---------- */
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: "$user" },

            /* ---------- LIVE PRODUCTS (FOR NAME, BRAND, CATEGORY) ---------- */
            {
                $lookup: {
                    from: "products",
                    localField: "shipments.returns.items.productId",
                    foreignField: "_id",
                    as: "products"
                }
            },

            /* ---------- BRANDS ---------- */
            {
                $lookup: {
                    from: "brands",
                    localField: "products.brand",
                    foreignField: "_id",
                    as: "brands"
                }
            },

            /* ---------- CATEGORIES ---------- */
            {
                $lookup: {
                    from: "categories",
                    localField: "products.category",
                    foreignField: "_id",
                    as: "categories"
                }
            },

            /* ---------- QC ADMIN ---------- */
            {
                $lookup: {
                    from: "admins",
                    localField: "shipments.returns.qc.checkedBy",
                    foreignField: "_id",
                    as: "qcAdmin"
                }
            },
            { $unwind: { path: "$qcAdmin", preserveNullAndEmptyArrays: true } },

            /* ---------- FINAL SHAPE ---------- */
            {
                $project: {
                    /* ---------- RETURN ---------- */
                    return: {
                        id: "$shipments.returns._id",
                        type: "$shipments.returns.type",
                        status: "$shipments.returns.status",
                        reason: "$shipments.returns.reason",
                        description: "$shipments.returns.description",
                        requestedAt: "$shipments.returns.createdAt",
                        trackingTimeline: "$shipments.returns.tracking_history",
                        auditTrail: "$shipments.returns.audit_trail"
                    },

                    /* ---------- ITEMS ---------- */
                    items: {
                        $map: {
                            input: "$shipments.returns.items",
                            as: "item",
                            in: {
                                productId: "$$item.productId",
                                quantity: "$$item.quantity",
                                reason: "$$item.reason",
                                reasonDescription: "$$item.reasonDescription",
                                condition: "$$item.condition",

                                /* ✅ USER UPLOADED RETURN PROOF */
                                returnImages: "$$item.images",

                                product: {
                                    $let: {
                                        vars: {
                                            /* 🔥 ORDER SNAPSHOT PRODUCT */
                                            orderProduct: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$products",
                                                            as: "op",
                                                            cond: { $eq: ["$$op._id", "$$item.productId"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            },

                                            /* LIVE PRODUCT */
                                            product: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$products",
                                                            as: "p",
                                                            cond: { $eq: ["$$p._id", "$$item.productId"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: {
                                            _id: "$$product._id",
                                            name: "$$product.name",

                                            brand: {
                                                $let: {
                                                    vars: {
                                                        brand: {
                                                            $arrayElemAt: [
                                                                {
                                                                    $filter: {
                                                                        input: "$brands",
                                                                        as: "b",
                                                                        cond: { $eq: ["$$b._id", "$$product.brand"] }
                                                                    }
                                                                },
                                                                0
                                                            ]
                                                        }
                                                    },
                                                    in: {
                                                        _id: "$$brand._id",
                                                        name: "$$brand.name"
                                                    }
                                                }
                                            },

                                            category: {
                                                $let: {
                                                    vars: {
                                                        category: {
                                                            $arrayElemAt: [
                                                                {
                                                                    $filter: {
                                                                        input: "$categories",
                                                                        as: "c",
                                                                        cond: { $eq: ["$$c._id", "$$product.category"] }
                                                                    }
                                                                },
                                                                0
                                                            ]
                                                        }
                                                    },
                                                    in: {
                                                        _id: "$$category._id",
                                                        name: "$$category.name"
                                                    }
                                                }
                                            },

                                            /* 🔥 CORRECT IMAGE FROM ORDER SNAPSHOT */
                                            image: "$$orderProduct.variant.image",

                                            /* 🔥 EXACT VARIANT USER BOUGHT */
                                            variant: "$$orderProduct.variant"
                                        }
                                    }
                                }
                            }
                        }
                    },

                    /* ---------- QC ---------- */
                    qc: {
                        status: "$shipments.returns.qc.status",
                        notes: "$shipments.returns.qc.notes",
                        images: "$shipments.returns.qc.images",
                        checkedAt: "$shipments.returns.qc.checkedAt",
                        checkedBy: {
                            _id: "$qcAdmin._id",
                            name: "$qcAdmin.name"
                        }
                    },

                    /* ---------- REFUND ---------- */
                    refund: {
                        amount: "$shipments.returns.refund.amount",
                        status: "$shipments.returns.refund.status",
                        gatewayRefundId: "$shipments.returns.refund.gatewayRefundId",
                        refundedAt: "$shipments.returns.refund.refundedAt"
                    },

                    /* ---------- SHIPMENT ---------- */
                    shipment: {
                        shipmentId: "$shipments.delhivery_pickup_id",
                        awb: "$shipments.waybill",
                        courier: "$shipments.courier_name",
                        trackingUrl: "$shipments.tracking_url",
                        status: "$shipments.status",
                        trackingTimeline: "$shipments.tracking_history"
                    },

                    /* ---------- ORDER ---------- */
                    order: {
                        id: "$_id",
                        orderId: "$orderId",
                        customOrderId: "$customOrderId",
                        amount: "$amount",
                        paymentStatus: "$paymentStatus",
                        createdAt: "$createdAt"
                    },

                    /* ---------- USER ---------- */
                    user: {
                        id: "$user._id",
                        name: "$user.name",
                        email: "$user.email",
                        phone: "$user.phone"
                    }
                }
            }
        ];

        const [data] = await Order.aggregate(pipeline);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Return not found"
            });
        }

        res.json({ success: true, data });

    } catch (err) {
        console.error("Return detail error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch return details"
        });
    }
};

export const getReturnsAnalytics = async (req, res) => {
    try {
        const { period = 'monthly', startDate, endDate } = req.query;
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        // 1. Overall metrics
        const overallMetrics = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            ...(Object.keys(dateFilter).length > 0 ? [
                { $match: { "shipments.returns.createdAt": dateFilter } }
            ] : []),
            {
                $group: {
                    _id: null,
                    totalReturns: { $sum: 1 },
                    totalRefundAmount: { $sum: "$shipments.returns.refund.amount" },
                    totalReplacements: {
                        $sum: { $cond: [{ $eq: ["$shipments.returns.type", "replace"] }, 1, 0] }
                    },
                    averageProcessingTime: {
                        $avg: {
                            $cond: {
                                if: {
                                    $and: [
                                        "$shipments.returns.timelines.requested_at",
                                        "$shipments.returns.timelines.refunded_at"
                                    ]
                                },
                                then: {
                                    $divide: [
                                        {
                                            $subtract: [
                                                "$shipments.returns.timelines.refunded_at",
                                                "$shipments.returns.timelines.requested_at"
                                            ]
                                        },
                                        1000 * 60 * 60 // Hours
                                    ]
                                },
                                else: null
                            }
                        }
                    }
                }
            }
        ]);

        // 2. Time-based trends
        const groupByFormat = period === 'daily' ? '%Y-%m-%d' :
            period === 'weekly' ? '%Y-%U' :
                period === 'monthly' ? '%Y-%m' :
                    '%Y-%m-%d';

        const trendMetrics = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            ...(Object.keys(dateFilter).length > 0 ? [
                { $match: { "shipments.returns.createdAt": dateFilter } }
            ] : []),
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: groupByFormat,
                            date: "$shipments.returns.createdAt"
                        }
                    },
                    returns: { $sum: 1 },
                    replacements: {
                        $sum: { $cond: [{ $eq: ["$shipments.returns.type", "replace"] }, 1, 0] }
                    },
                    refundAmount: { $sum: "$shipments.returns.refund.amount" },
                    averageValue: { $avg: "$shipments.returns.refund.amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 3. Status distribution
        const statusDistribution = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            ...(Object.keys(dateFilter).length > 0 ? [
                { $match: { "shipments.returns.createdAt": dateFilter } }
            ] : []),
            {
                $group: {
                    _id: "$shipments.returns.status",
                    count: { $sum: 1 },
                    averageRefund: { $avg: "$shipments.returns.refund.amount" }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const reasonDistribution = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            { $unwind: "$shipments.returns.items" },

            ...(Object.keys(dateFilter).length > 0 ? [
                { $match: { "shipments.returns.createdAt": dateFilter } }
            ] : []),

            {
                $group: {
                    _id: "$shipments.returns.items.reason",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const productReturns = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            { $unwind: "$shipments.returns.items" },

            ...(Object.keys(dateFilter).length > 0 ? [{
                $match: { "shipments.returns.createdAt": dateFilter }
            }] : []),

            {
                $lookup: {
                    from: "products",
                    localField: "shipments.returns.items.productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },

            // 1️⃣ GROUP BY PRODUCT + REASON
            {
                $group: {
                    _id: {
                        productId: "$product._id",
                        reason: "$shipments.returns.items.reason"
                    },
                    productName: { $first: "$product.name" },
                    category: { $first: "$product.category" },
                    count: { $sum: 1 },
                    quantity: { $sum: "$shipments.returns.items.quantity" }
                }
            },

            // 2️⃣ SORT REASONS BY COUNT
            { $sort: { count: -1 } },

            // 3️⃣ GROUP BACK TO PRODUCT
            {
                $group: {
                    _id: "$_id.productId",
                    productName: { $first: "$productName" },
                    category: { $first: "$category" },
                    returnCount: { $sum: "$count" },
                    totalQuantity: { $sum: "$quantity" },
                    topReason: {
                        $first: {
                            reason: "$_id.reason",
                            count: "$count"
                        }
                    }
                }
            },

            // 4️⃣ SORT PRODUCTS BY RETURNS
            { $sort: { returnCount: -1 } },
            { $limit: 10 }
        ]);


        // 6. User-wise return patterns
        const userPatterns = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            ...(Object.keys(dateFilter).length > 0 ? [
                { $match: { "shipments.returns.createdAt": dateFilter } }
            ] : []),
            {
                $group: {
                    _id: "$user",
                    returnCount: { $sum: 1 },
                    totalRefundAmount: { $sum: "$shipments.returns.refund.amount" },
                    averageRefund: { $avg: "$shipments.returns.refund.amount" },
                    replacementCount: {
                        $sum: { $cond: [{ $eq: ["$shipments.returns.type", "replace"] }, 1, 0] }
                    }
                }
            },
            { $sort: { returnCount: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            { $unwind: "$userDetails" },
            {
                $project: {
                    userId: "$_id",
                    userName: "$userDetails.name",
                    userEmail: "$userDetails.email",
                    returnCount: 1,
                    totalRefundAmount: 1,
                    averageRefund: 1,
                    replacementCount: 1
                }
            }
        ]);

        return res.json({
            success: true,
            data: {
                overallMetrics: overallMetrics[0] || {
                    totalReturns: 0,
                    totalRefundAmount: 0,
                    totalReplacements: 0,
                    averageProcessingTime: 0
                },
                trends: trendMetrics,
                statusDistribution,
                reasonDistribution,
                topReturningProducts: productReturns,
                topReturningUsers: userPatterns,
                timePeriod: period,
                dateRange: {
                    start: startDate,
                    end: endDate
                }
            }
        });

    } catch (error) {
        console.error("Admin returns analytics error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch analytics",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

