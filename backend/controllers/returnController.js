
// // controllers/shipmentReturnController.js
// import mongoose from "mongoose";
// import Order from "../models/Order.js";
// import User from "../models/User.js";
// import { createShiprocketReturnOrder } from "../middlewares/services/shiprocket.js";
// import { uploadToCloudinary } from "../middlewares/upload.js";
// import { sendEmail } from "../middlewares/utils/emailService.js";
// import { addRefundJob } from "../middlewares/services/refundQueue.js";

// // ✅ Helper to validate ObjectId
// const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// // ---------------------- USER ENDPOINTS ----------------------

// export const requestShipmentReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { shipment_id } = req.params; 
//         const { items, reason, reasonDescription = "" } = req.body;

//         if (!shipment_id) {
//             return res.status(400).json({ success: false, message: "shipment_id is required" });
//         }

//         // FIND ORDER
//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         // USER OWNERSHIP
//         if (order.user.toString() !== userId.toString()) {
//             return res.status(403).json({ success: false, message: "Not your shipment" });
//         }

//         // RETURN WINDOW
//         const deliveredAt = shipment.deliveredAt || order.deliveredAt || order.updatedAt;
//         const allowedDays = order.returnPolicy?.days || 7;
//         const diffDays = Math.floor((Date.now() - new Date(deliveredAt)) / 86400000);

//         if (diffDays > allowedDays) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Return window expired (${allowedDays} days)`
//             });
//         }

//         // ITEMS REQUIRED
//         if (!Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({ success: false, message: "Items are required" });
//         }

//         const validatedItems = [];

//         for (const item of items) {
//             const { productId, quantity, variant, condition } = item;

//             if (!productId)
//                 return res.status(400).json({ success: false, message: "Invalid productId" });

//             const found = shipment.products.find(p => {
//                 if (variant) {
//                     return (
//                         p.productId.toString() === productId &&
//                         p.variant?.sku === variant.sku
//                     );
//                 }
//                 return p.productId.toString() === productId;
//             });

//             if (!found)
//                 return res.status(400).json({
//                     success: false,
//                     message: "Item does not belong to this shipment"
//                 });

//             if (quantity > found.quantity)
//                 return res.status(400).json({
//                     success: false,
//                     message: "Invalid quantity requested"
//                 });

//             // Duplicate check
//             const duplicate = shipment.returns?.some(r =>
//                 r.items.some(i =>
//                     i.productId.toString() === productId &&
//                     (!variant || i.variant?.sku === variant.sku) &&
//                     i.status !== "cancelled"
//                 )
//             );

//             if (duplicate)
//                 return res.status(400).json({
//                     success: false,
//                     message: `Return already requested for product ${productId}`
//                 });

//             // IMAGES
//             let uploadedImages = [];
//             const fieldKey = `images_${productId}`;

//             if (req.files && req.files[fieldKey]) {
//                 const imgFiles = req.files[fieldKey];
//                 for (const img of imgFiles) {
//                     const result = await uploadToCloudinary(
//                         img.buffer,
//                         `returns/${shipment_id}/${productId}`
//                     );
//                     uploadedImages.push(result.secure_url ?? result);
//                 }
//             }

//             validatedItems.push({
//                 _id: new mongoose.Types.ObjectId(),
//                 productId,
//                 quantity,
//                 ...(variant ? { variant } : {}),
//                 reason,
//                 reasonDescription,
//                 images: uploadedImages,
//                 condition: condition || "Unopened",
//                 status: "requested"
//             });
//         }

//         // FINAL RETURN ENTRY (MATCHES YOUR SCHEMA)
//         const returnEntry = {
//             _id: new mongoose.Types.ObjectId(),

//             shiprocket_order_id: null,
//             shipment_id: shipment_id,
//             awb_code: null,
//             courier_name: null,
//             tracking_url: null,

//             status: "requested",

//             pickup_details: {},
//             warehouse_details: {},

//             items: validatedItems,

//             tracking_history: [],
//             qc: {
//                 checkedBy: null,
//                 checkedAt: null,
//                 notes: "",
//                 images: [],
//                 status: null
//             },

//             refund: {
//                 amount: 0,
//                 status: "pending",
//                 gatewayRefundId: null,
//                 refundedAt: null
//             },

//             audit_trail: [
//                 {
//                     status: "requested",
//                     action: "Return Requested",
//                     performedBy: userId,
//                     performedByModel: "User",
//                     timestamp: new Date(),
//                     notes: reasonDescription,
//                     metadata: {}
//                 }
//             ],

//             requestedBy: userId,
//             requestedAt: new Date(),
//             reason,
//             description: reasonDescription
//         };

//         if (!shipment.returns) shipment.returns = [];
//         shipment.returns.push(returnEntry);

//         await order.save();

//         // EMAIL
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Request Received - Shipment ${shipment.shipment_id}`,
//                 `<p>Your return request for Shipment #${shipment.shipment_id} has been received.</p>`
//             );
//         }

//         return res.status(201).json({
//             success: true,
//             message: "Return request submitted",
//             returnId: returnEntry._id,
//             data: returnEntry
//         });

//     } catch (err) {
//         console.error("Return Request Error:", err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// export const getMyShipmentReturns = async (req, res) => {
//     try {
//         const userId = req.user._id;

//         const orders = await Order.find({
//             user: userId,
//             "shipments.returns.0": { $exists: true }
//         })
//             .select("shipments createdAt")
//             .sort({ createdAt: -1 });

//         const flattened = [];

//         for (const o of orders) {
//             for (const s of o.shipments || []) {
//                 if (!s.returns?.length) continue;

//                 for (const r of s.returns) {
//                     flattened.push({
//                         shipmentId: s.shipment_id,
//                         shipmentCode: s.shipment_id,
//                         return: r
//                     });
//                 }
//             }
//         }

//         return res.json({ success: true, data: flattened });

//     } catch (err) {
//         console.error("getMyShipmentReturns Error:", err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// export const getShipmentReturnDetails = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;

//         if (!mongoose.Types.ObjectId.isValid(returnId)) {
//             return res.status(400).json({ success: false, message: "Invalid returnId" });
//         }

//         const order = await Order.findOne({
//             "shipments.shipment_id": shipment_id
//         }).populate("user", "name email");

//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         // Access allowed for user or admin
//         if (
//             req.user &&
//             order.user._id.toString() !== req.user._id.toString() &&
//             !(req.admin && req.admin._id)
//         ) {
//             return res.status(403).json({ success: false, message: "Not authorized" });
//         }

//         return res.json({
//             success: true,
//             data: { shipmentCode: shipment.shipment_id, return: ret }
//         });

//     } catch (err) {
//         console.error("getShipmentReturnDetails Error:", err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// export const cancelShipmentReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { shipment_id, returnId } = req.params;

//         if (!mongoose.Types.ObjectId.isValid(returnId)) {
//             return res.status(400).json({ success: false, message: "Invalid returnId" });
//         }

//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         if (order.user.toString() !== userId.toString()) {
//             return res.status(403).json({ success: false, message: "Not your shipment" });
//         }

//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (ret.status !== "requested") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Cannot cancel after processing"
//             });
//         }

//         ret.status = "cancelled";

//         if (!ret.tracking_history) ret.tracking_history = [];
//         if (!ret.audit_trail) ret.audit_trail = [];

//         // tracking entry
//         ret.tracking_history.push({
//             status: "cancelled",
//             timestamp: new Date(),
//             location: "User",
//             description: req.body?.notes || "User cancelled the return"
//         });

//         // audit entry
//         ret.audit_trail.push({
//             status: "cancelled",
//             action: "user_cancelled",
//             performedBy: userId,
//             performedByModel: "User",
//             timestamp: new Date(),
//             notes: req.body?.notes || "User cancelled the return"
//         });

//         await order.save();

//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Cancelled - Shipment ${shipment.shipment_id}`,
//                 `<p>Your return request has been cancelled.</p>`
//             );
//         }

//         return res.json({
//             success: true,
//             message: "Return cancelled successfully"
//         });

//     } catch (err) {
//         console.error("cancelShipmentReturn Error:", err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ---------------------- ADMIN ENDPOINTS ----------------------

// export const approveShipmentReturn = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;

//         // Find order + shipment + return
//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         // CHECK actual schema field
//         if (ret.status !== "requested") {
//             return res.status(400).json({ success: false, message: "Return already processed" });
//         }

//         // Create Shiprocket Return Order
//         let shiprocketResult;
//         try {
//             shiprocketResult = await createShiprocketReturnOrder(order, ret);

//             ret.shiprocket_order_id = shiprocketResult.order_id;
//             ret.shipment_id = shiprocketResult.shipment_id;

//             ret.status = "pickup_scheduled";

//             // Add tracking history (Exists in model)
//             ret.tracking_history.push({
//                 status: "pickup_scheduled",
//                 timestamp: new Date(),
//                 location: "System",
//                 description: "Return pickup scheduled by Shiprocket"
//             });

//         } catch (err) {
//             return res.status(422).json({
//                 success: false,
//                 message: "Failed to create Shiprocket return order",
//                 error: err.message
//             });
//         }

//         // Audit trail (Exists in model)
//         ret.audit_trail.push({
//             status: "approved",
//             action: "admin_approved",
//             performedBy: req.admin?._id,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         // Notify user
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 "Return Approved",
//                 `<p>Your return request for Shipment #${shipment.shipment_id} has been approved.</p>`
//             );
//         }

//         return res.json({ success: true, message: "Return approved", shiprocket: shiprocketResult });

//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// export const markShipmentReturnReceived = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;

//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (["received_at_warehouse", "refunded"].includes(ret.overallStatus)) {
//             return res.status(400).json({ success: false, message: "Already processed" });
//         }

//         ret.overallStatus = "received_at_warehouse";
//         ret.receivedAt = new Date();

//         if (!ret.auditTrail) ret.auditTrail = [];
//         if (!ret.timeline) ret.timeline = [];

//         // Audit
//         ret.auditTrail.push({
//             status: "received_at_warehouse",
//             action: "admin_mark_received",
//             performedBy: req.admin._id,
//             performedByModel: "Admin",
//             timestamp: new Date(),
//             notes: req.body?.notes || "Received at warehouse"
//         });

//         // Timeline
//         ret.timeline.push({
//             status: "received_at_warehouse",
//             timestamp: new Date(),
//             location: "Warehouse",
//             description: req.body?.notes || "Return received at warehouse"
//         });

//         await order.save();

//         // Add refund job
//         await addRefundJob(order._id, {
//             shipment_id: shipment.shipment_id,
//             returnId: ret._id,
//             amount: ret.refund?.amount || order.amount
//         });

//         // Notify customer
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Received`,
//                 `<p>Your returned item(s) for Shipment #${shipment.shipment_id} were received.</p>`
//             );
//         }

//         return res.json({ success: true, message: "Return received – refund initiated" });

//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// export const rejectShipmentReturn = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;
//         const { reason } = req.body;

//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (ret.overallStatus !== "requested") {
//             return res.status(400).json({ success: false, message: "Already processed" });
//         }

//         ret.overallStatus = "rejected";
//         ret.adminRejectionReason = reason;

//         if (!ret.auditTrail) ret.auditTrail = [];
//         if (!ret.timeline) ret.timeline = [];

//         ret.auditTrail.push({
//             status: "rejected",
//             action: "admin_rejected",
//             notes: reason,
//             performedBy: req.admin?._id,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         ret.timeline.push({
//             status: "rejected",
//             timestamp: new Date(),
//             location: "Admin",
//             description: reason
//         });

//         await order.save();

//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Rejected`,
//                 `<p>Your return request for Shipment #${shipment.shipment_id} has been rejected.</p><p>Reason: ${reason}</p>`
//             );
//         }

//         return res.json({ success: true, message: "Return rejected" });

//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };








// the above part is complete now do more validation and things at saturday ,13-12-2025





// controllers/shipmentReturnController.js
import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { createShiprocketReturnOrder } from "../middlewares/services/shiprocket.js";
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

// export const requestShipmentReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { shipment_id } = req.params; 
//         const { items, reason, reasonDescription = "" } = req.body;

//         if (!shipment_id) {
//             return res.status(400).json({ success: false, message: "shipment_id is required" });
//         }

//         // FIND ORDER
//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         // USER OWNERSHIP
//         if (order.user.toString() !== userId.toString()) {
//             return res.status(403).json({ success: false, message: "Not your shipment" });
//         }

//         // RETURN WINDOW
//         const deliveredAt = shipment.deliveredAt || order.deliveredAt || order.updatedAt;
//         const allowedDays = order.returnPolicy?.days || 7;
//         const diffDays = Math.floor((Date.now() - new Date(deliveredAt)) / 86400000);

//         if (diffDays > allowedDays) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Return window expired (${allowedDays} days)`
//             });
//         }

//         // ITEMS REQUIRED
//         if (!Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({ success: false, message: "Items are required" });
//         }

//         const validatedItems = [];

//         for (const item of items) {
//             const { productId, quantity, variant, condition } = item;

//             if (!productId)
//                 return res.status(400).json({ success: false, message: "Invalid productId" });

//             const found = shipment.products.find(p => {
//                 if (variant) {
//                     return (
//                         p.productId.toString() === productId &&
//                         p.variant?.sku === variant.sku
//                     );
//                 }
//                 return p.productId.toString() === productId;
//             });

//             if (!found)
//                 return res.status(400).json({
//                     success: false,
//                     message: "Item does not belong to this shipment"
//                 });

//             if (quantity > found.quantity)
//                 return res.status(400).json({
//                     success: false,
//                     message: "Invalid quantity requested"
//                 });

//             // Duplicate check
//             const duplicate = shipment.returns?.some(r =>
//                 r.items.some(i =>
//                     i.productId.toString() === productId &&
//                     (!variant || i.variant?.sku === variant.sku) &&
//                     i.status !== "cancelled"
//                 )
//             );

//             if (duplicate)
//                 return res.status(400).json({
//                     success: false,
//                     message: `Return already requested for product ${productId}`
//                 });

//             // IMAGES
//             let uploadedImages = [];
//             const fieldKey = `images_${productId}`;

//             if (req.files && req.files[fieldKey]) {
//                 const imgFiles = req.files[fieldKey];
//                 for (const img of imgFiles) {
//                     const result = await uploadToCloudinary(
//                         img.buffer,
//                         `returns/${shipment_id}/${productId}`
//                     );
//                     uploadedImages.push(result.secure_url ?? result);
//                 }
//             }

//             validatedItems.push({
//                 _id: new mongoose.Types.ObjectId(),
//                 productId,
//                 quantity,
//                 ...(variant ? { variant } : {}),
//                 reason,
//                 reasonDescription,
//                 images: uploadedImages,
//                 condition: condition || "Unopened",
//                 status: "requested"
//             });
//         }

//         // FINAL RETURN ENTRY (MATCHES YOUR SCHEMA)
//         const returnEntry = {
//             _id: new mongoose.Types.ObjectId(),

//             shiprocket_order_id: null,
//             shipment_id: shipment_id,
//             awb_code: null,
//             courier_name: null,
//             tracking_url: null,

//             status: "requested",

//             pickup_details: {},
//             warehouse_details: {},

//             items: validatedItems,

//             tracking_history: [],
//             qc: {
//                 checkedBy: null,
//                 checkedAt: null,
//                 notes: "",
//                 images: [],
//                 status: null
//             },

//             refund: {
//                 amount: 0,
//                 status: "pending",
//                 gatewayRefundId: null,
//                 refundedAt: null
//             },

//             audit_trail: [
//                 {
//                     status: "requested",
//                     action: "Return Requested",
//                     performedBy: userId,
//                     performedByModel: "User",
//                     timestamp: new Date(),
//                     notes: reasonDescription,
//                     metadata: {}
//                 }
//             ],

//             requestedBy: userId,
//             requestedAt: new Date(),
//             reason,
//             description: reasonDescription
//         };

//         if (!shipment.returns) shipment.returns = [];
//         shipment.returns.push(returnEntry);

//         await order.save();

//         // EMAIL
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Request Received - Shipment ${shipment.shipment_id}`,
//                 `<p>Your return request for Shipment #${shipment.shipment_id} has been received.</p>`
//             );
//         }

//         return res.status(201).json({
//             success: true,
//             message: "Return request submitted",
//             returnId: returnEntry._id,
//             data: returnEntry
//         });

//     } catch (err) {
//         console.error("Return Request Error:", err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

export const requestShipmentReturn = async (req, res) => {
    try {
        const userId = req.user._id;
        const { shipment_id } = req.params;
        const {
            items,
            reason,
            reasonDescription = "",
            type
        } = req.body;

        if (!shipment_id) {
            return res.status(400).json({ success: false, message: "shipment_id is required" });
        }

        if (!["return", "replace"].includes(type)) {
            return res.status(400).json({ success: false, message: "Invalid return type" });
        }

        // 1️⃣ FIND ORDER & SHIPMENT
        const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        // 2️⃣ OWNERSHIP CHECK
        if (order.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not your shipment" });
        }

        // 3️⃣ MUST BE DELIVERED
        if (!shipment.deliveredAt && shipment.status !== "Delivered") {
            return res.status(400).json({
                success: false,
                message: "Return allowed only after delivery"
            });
        }

        // 4️⃣ RETURN WINDOW
        const deliveredAt = shipment.deliveredAt;
        const allowedDays = order.returnPolicy?.days || 7;
        const diffDays = Math.floor((Date.now() - new Date(deliveredAt)) / 86400000);

        if (diffDays > allowedDays) {
            return res.status(400).json({
                success: false,
                message: `Return window expired (${allowedDays} days)`
            });
        }

        // 5️⃣ ITEMS VALIDATION
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Items are required" });
        }

        const validatedItems = [];

        for (const item of items) {
            const { productId, quantity, variant, condition } = item;

            if (!productId || !quantity || quantity <= 0) {
                return res.status(400).json({ success: false, message: "Invalid item data" });
            }

            // 6️⃣ FIND PRODUCT IN SHIPMENT
            const found = shipment.products.find(p =>
                p.productId.toString() === productId &&
                (!variant || p.variant?.sku === variant.sku)
            );

            if (!found) {
                return res.status(400).json({
                    success: false,
                    message: "Item does not belong to this shipment"
                });
            }

            // 7️⃣ QUANTITY ABUSE PROTECTION (IMPORTANT)
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
                    message: "Return quantity exceeds purchased quantity"
                });
            }

            // 8️⃣ DUPLICATE ACTIVE RETURN CHECK (FIXED)
            const duplicate = shipment.returns?.some(r =>
                r.status !== "cancelled" &&
                r.items.some(i =>
                    i.productId.toString() === productId &&
                    (!variant || i.variant?.sku === variant.sku)
                )
            );

            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message: "Return already requested for this item"
                });
            }

            // 9️⃣ IMAGE HANDLING
            let uploadedImages = [];
            const fieldKey = `images_${productId}`;

            if (req.files && req.files[fieldKey]) {
                const imgFiles = Array.isArray(req.files[fieldKey])
                    ? req.files[fieldKey]
                    : [req.files[fieldKey]];

                if (imgFiles.length > MAX_IMAGES_PER_ITEM) {
                    return res.status(400).json({
                        success: false,
                        message: `Maximum ${MAX_IMAGES_PER_ITEM} images allowed per item`
                    });
                }

                for (const img of imgFiles) {
                    const result = await uploadToCloudinary(
                        img.buffer,
                        `returns/${shipment_id}/${productId}`
                    );
                    uploadedImages.push(result.secure_url ?? result);
                }
            }

            // 🔟 IMAGE REQUIRED RULE (NYKAA STYLE)
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

        // 1️⃣1️⃣ FINAL RETURN ENTRY
        const returnEntry = {
            _id: new mongoose.Types.ObjectId(),
            shipment_id,
            status: "requested",
            type, // return | replace

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
                    action: type === "replace" ? "Replacement Requested" : "Return Requested",
                    performedBy: userId,
                    performedByModel: "User",
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

        // ANALYTICS
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
                        shipmentId: s.shipment_id,
                        shipmentCode: s.shipment_id,
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
        const { shipment_id, returnId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(returnId)) {
            return res.status(400).json({ success: false, message: "Invalid returnId" });
        }

        const order = await Order.findOne({
            "shipments.shipment_id": shipment_id
        }).populate("user", "name email");

        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        // Access allowed for user or admin
        if (
            req.user &&
            order.user._id.toString() !== req.user._id.toString() &&
            !(req.admin && req.admin._id)
        ) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        return res.json({
            success: true,
            data: { shipmentCode: shipment.shipment_id, return: ret }
        });

    } catch (err) {
        console.error("getShipmentReturnDetails Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const cancelShipmentReturn = async (req, res) => {
    try {
        const userId = req.user._id;
        const { shipment_id, returnId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(returnId)) {
            return res.status(400).json({ success: false, message: "Invalid returnId" });
        }

        const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        if (order.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not your shipment" });
        }

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        if (ret.status !== "requested") {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel after processing"
            });
        }

        ret.status = "cancelled";

        if (!ret.tracking_history) ret.tracking_history = [];
        if (!ret.audit_trail) ret.audit_trail = [];

        // tracking entry
        ret.tracking_history.push({
            status: "cancelled",
            timestamp: new Date(),
            location: "User",
            description: req.body?.notes || "User cancelled the return"
        });

        // audit entry
        ret.audit_trail.push({
            status: "cancelled",
            action: "user_cancelled",
            performedBy: userId,
            performedByModel: "User",
            timestamp: new Date(),
            notes: req.body?.notes || "User cancelled the return"
        });

        await order.save();

        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                `Return Cancelled - Shipment ${shipment.shipment_id}`,
                `<p>Your return request has been cancelled.</p>`
            );
        }

        return res.json({
            success: true,
            message: "Return cancelled successfully"
        });

    } catch (err) {
        console.error("cancelShipmentReturn Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ---------------------- ADMIN ENDPOINTS ----------------------

// export const approveShipmentReturn = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;

//         // Find order + shipment + return
//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         // CHECK actual schema field
//         if (ret.status !== "requested") {
//             return res.status(400).json({ success: false, message: "Return already processed" });
//         }

//         // Create Shiprocket Return Order
//         let shiprocketResult;
//         try {
//             shiprocketResult = await createShiprocketReturnOrder(order, ret);

//             ret.shiprocket_order_id = shiprocketResult.order_id;
//             ret.shipment_id = shiprocketResult.shipment_id;

//             ret.status = "pickup_scheduled";

//             // Add tracking history (Exists in model)
//             ret.tracking_history.push({
//                 status: "pickup_scheduled",
//                 timestamp: new Date(),
//                 location: "System",
//                 description: "Return pickup scheduled by Shiprocket"
//             });

//         } catch (err) {
//             return res.status(422).json({
//                 success: false,
//                 message: "Failed to create Shiprocket return order",
//                 error: err.message
//             });
//         }

//         // Audit trail (Exists in model)
//         ret.audit_trail.push({
//             status: "approved",
//             action: "admin_approved",
//             performedBy: req.admin?._id,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         // Notify user
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 "Return Approved",
//                 `<p>Your return request for Shipment #${shipment.shipment_id} has been approved.</p>`
//             );
//         }

//         return res.json({ success: true, message: "Return approved", shiprocket: shiprocketResult });

//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

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
                        awb_code: "$shipments.awb_code",
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
        const { shipment_id, returnId } = req.params;

        // 1️⃣ Find order
        const order = await Order.findOne({
            "shipments.shipment_id": shipment_id
        }).populate("user");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order / Shipment not found" });
        }

        // 2️⃣ Find shipment
        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: "Shipment not found" });
        }

        // 3️⃣ Find return
        const ret = shipment.returns.id(returnId);
        if (!ret) {
            return res.status(404).json({ success: false, message: "Return not found" });
        }

        // 4️⃣ State validation
        if (ret.status !== "requested") {
            return res.status(400).json({
                success: false,
                message: `Return already processed (current: ${ret.status})`
            });
        }

        // 5️⃣ Idempotency safety
        if (ret.shiprocket_order_id) {
            return res.json({
                success: true,
                message: "Return already approved & Shiprocket created",
                shiprocket_order_id: ret.shiprocket_order_id
            });
        }

        // 6️⃣ Create Shiprocket return
        let srData;
        try {
            srData = await createShiprocketReturnOrder(order, shipment, ret);
        } catch (err) {
            ret.audit_trail.push({
                status: "shiprocket_failed",
                action: "shiprocket_api_error",
                performedBy: req.admin?._id,
                performedByModel: "Admin",
                timestamp: new Date(),
                notes: err.message
            });

            await order.save();

            return res.status(422).json({
                success: false,
                message: "Shiprocket return creation failed",
                error: err.message
            });
        }

        // 7️⃣ Update SAME return (IMPORTANT)
        ret.shiprocket_order_id = srData.order_id;
        ret.shipment_id = srData.shipment_id;
        ret.awb_code = srData.awb_code || null;
        ret.courier_name = srData.courier_name || null;
        ret.tracking_url = srData.tracking_url || null;

        ret.status = "pickup_scheduled";

        ret.qc = ret.qc || {};
        ret.qc.status = "pending";

        ret.tracking_history.push({
            status: "pickup_scheduled",
            timestamp: new Date(),
            location: "System",
            description: "Return pickup scheduled via Shiprocket"
        });

        ret.audit_trail.push({
            status: "approved",
            action: "admin_approved",
            performedBy: req.admin?._id,
            performedByModel: "Admin",
            timestamp: new Date(),
            metadata: { shiprocket: srData }
        });

        await order.save();

        // 8️⃣ Notify user
        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                ret.type === "replace" ? "Replacement Approved" : "Return Approved",
                `<p>Your ${ret.type} request for Shipment #${shipment.shipment_id} has been approved.</p>`
            );
        }

        return res.json({
            success: true,
            message: "Return approved & pickup scheduled",
            shiprocket: srData
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
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
        const { shipment_id, returnId } = req.params;
        const { reason } = req.body;

        const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        if (ret.overallStatus !== "requested") {
            return res.status(400).json({ success: false, message: "Already processed" });
        }

        ret.overallStatus = "rejected";
        ret.adminRejectionReason = reason;

        if (!ret.auditTrail) ret.auditTrail = [];
        if (!ret.timeline) ret.timeline = [];

        ret.auditTrail.push({
            status: "rejected",
            action: "admin_rejected",
            notes: reason,
            performedBy: req.admin?._id,
            performedByModel: "Admin",
            timestamp: new Date()
        });

        ret.timeline.push({
            status: "rejected",
            timestamp: new Date(),
            location: "Admin",
            description: reason
        });

        await order.save();

        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                `Return Rejected`,
                `<p>Your return request for Shipment #${shipment.shipment_id} has been rejected.</p><p>Reason: ${reason}</p>`
            );
        }

        return res.json({ success: true, message: "Return rejected" });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};




// ===== ADMIN RETURNS DASHBOARD ENDPOINTS =====

/**
 * GET /admin/returns/summary
 * Get comprehensive summary of all returns/replacements
 */
// export const getReturnsSummary = async (req, res) => {
//     try {
//         const { 
//             page = 1, 
//             limit = 20, 
//             status, 
//             type, 
//             reason, 
//             startDate, 
//             endDate,
//             orderId,
//             userId,
//             search,
//             sortBy = 'requestedAt',
//             sortOrder = 'desc'
//         } = req.query;

//         // Build aggregation pipeline
//         const pipeline = [];

//         // Stage 1: Match orders with returns
//         pipeline.push({
//             $match: {
//                 "shipments.returns": { $exists: true, $ne: [] }
//             }
//         });

//         // Stage 2: Unwind shipments and returns
//         pipeline.push({
//             $unwind: "$shipments"
//         });

//         pipeline.push({
//             $unwind: "$shipments.returns"
//         });

//         // Stage 3: Add order details to each return
//         pipeline.push({
//             $addFields: {
//                 "shipments.returns.orderDetails": {
//                     orderId: "$orderId",
//                     orderNumber: "$orderNumber",
//                     customOrderId: "$customOrderId",
//                     customerName: "$customerName",
//                     user: "$user",
//                     totalAmount: "$amount",
//                     paymentStatus: "$paymentStatus",
//                     orderStatus: "$orderStatus",
//                     shippingAddress: "$shippingAddress",
//                     createdAt: "$createdAt"
//                 },
//                 "shipments.returns.shipmentDetails": {
//                     shipmentId: "$shipments.shipment_id",
//                     awbCode: "$shipments.awb_code",
//                     courierName: "$shipments.courier_name",
//                     deliveredAt: "$shipments.deliveredAt",
//                     shipmentStatus: "$shipments.status"
//                 }
//             }
//         });

//         // Stage 4: Filtering
//         const matchStage = {};

//         if (status) {
//             matchStage["shipments.returns.status"] = status;
//         }

//         if (type) {
//             matchStage["shipments.returns.type"] = type;
//         }

//         if (reason) {
//             matchStage["shipments.returns.reason"] = reason;
//         }

//         if (orderId) {
//             matchStage["orderId"] = orderId;
//         }

//         if (userId) {
//             matchStage["user"] = new mongoose.Types.ObjectId(userId);
//         }

//         if (startDate || endDate) {
//             matchStage["shipments.returns.requestedAt"] = {};
//             if (startDate) {
//                 matchStage["shipments.returns.requestedAt"].$gte = new Date(startDate);
//             }
//             if (endDate) {
//                 matchStage["shipments.returns.requestedAt"].$lte = new Date(endDate);
//             }
//         }

//         if (search) {
//             matchStage.$or = [
//                 { "orderId": { $regex: search, $options: 'i' } },
//                 { "customOrderId": { $regex: search, $options: 'i' } },
//                 { "customerName": { $regex: search, $options: 'i' } },
//                 { "shipments.returns.reason": { $regex: search, $options: 'i' } },
//                 { "shipments.shipment_id": { $regex: search, $options: 'i' } }
//             ];
//         }

//         if (Object.keys(matchStage).length > 0) {
//             pipeline.push({ $match: matchStage });
//         }

//         // Stage 5: Lookup user details
//         pipeline.push({
//             $lookup: {
//                 from: "users",
//                 localField: "user",
//                 foreignField: "_id",
//                 as: "userDetails"
//             }
//         });

//         pipeline.push({
//             $unwind: {
//                 path: "$userDetails",
//                 preserveNullAndEmptyArrays: true
//             }
//         });

//         // Stage 6: Lookup product details for each item
//         pipeline.push({
//             $lookup: {
//                 from: "products",
//                 localField: "shipments.returns.items.productId",
//                 foreignField: "_id",
//                 as: "productDetails"
//             }
//         });

//         // Stage 7: Format the data
//         pipeline.push({
//             $addFields: {
//                 "shipments.returns.userDetails": {
//                     _id: "$userDetails._id",
//                     name: "$userDetails.name",
//                     email: "$userDetails.email",
//                     phone: "$userDetails.phone"
//                 }
//             }
//         });

//         // Stage 8: Project only necessary fields
//         pipeline.push({
//             $project: {
//                 _id: "$shipments.returns._id",
//                 returnId: "$shipments.returns._id",
//                 type: "$shipments.returns.type",
//                 status: "$shipments.returns.status",
//                 reason: "$shipments.returns.reason",
//                 description: "$shipments.returns.description",
//                 requestedAt: "$shipments.returns.requestedAt",
//                 requestedBy: "$shipments.returns.requestedBy",

//                 // Order details
//                 orderId: "$orderId",
//                 orderNumber: "$orderNumber",
//                 customOrderId: "$customOrderId",
//                 orderAmount: "$amount",
//                 paymentStatus: "$paymentStatus",
//                 orderStatus: "$orderStatus",

//                 // Shipment details
//                 shipmentId: "$shipments.shipment_id",
//                 shipmentAwb: "$shipments.awb_code",
//                 shipmentCourier: "$shipments.courier_name",
//                 shipmentDeliveredAt: "$shipments.deliveredAt",

//                 // User details
//                 customerName: "$customerName",
//                 user: {
//                     _id: "$userDetails._id",
//                     name: "$userDetails.name",
//                     email: "$userDetails.email",
//                     phone: "$userDetails.phone"
//                 },

//                 // Return items with product details
//                 items: {
//                     $map: {
//                         input: "$shipments.returns.items",
//                         as: "item",
//                         in: {
//                             productId: "$$item.productId",
//                             quantity: "$$item.quantity",
//                             variant: "$$item.variant",
//                             reason: "$$item.reason",
//                             condition: "$$item.condition",
//                             images: "$$item.images"
//                         }
//                     }
//                 },

//                 // Tracking
//                 tracking_history: "$shipments.returns.tracking_history",

//                 // QC Details
//                 qc: "$shipments.returns.qc",

//                 // Refund Details
//                 refund: "$shipments.returns.refund",

//                 // Audit Trail
//                 audit_trail: "$shipments.returns.audit_trail",

//                 // Timelines
//                 timelines: {
//                     requestedAt: "$shipments.returns.requestedAt",
//                     approvedAt: "$shipments.returns.timelines?.approved_at",
//                     pickupScheduledAt: "$shipments.returns.timelines?.pickup_scheduled_at",
//                     pickedUpAt: "$shipments.returns.timelines?.picked_up_at",
//                     deliveredToWarehouseAt: "$shipments.returns.timelines?.delivered_to_warehouse_at",
//                     qcCompletedAt: "$shipments.returns.timelines?.qc_completed_at",
//                     refundInitiatedAt: "$shipments.returns.timelines?.refund_initiated_at",
//                     refundedAt: "$shipments.returns.timelines?.refunded_at"
//                 },

//                 // Flags
//                 requiresManualReview: "$shipments.returns.flags?.requires_manual_review",
//                 isHighValue: "$shipments.returns.flags?.is_high_value",

//                 // Counts
//                 totalItems: { $size: "$shipments.returns.items" },
//                 totalQuantity: {
//                     $sum: "$shipments.returns.items.quantity"
//                 },
//                 estimatedRefund: "$shipments.returns.refund.amount",

//                 // Metadata
//                 createdAt: "$shipments.returns.createdAt",
//                 updatedAt: "$shipments.returns.updatedAt"
//             }
//         });

//         // Stage 9: Sorting
//         const sortDirection = sortOrder === 'asc' ? 1 : -1;
//         const sortFieldMap = {
//             requestedAt: "requestedAt",
//             updatedAt: "updatedAt",
//             orderId: "orderId",
//             status: "status",
//             amount: "estimatedRefund"
//         };

//         pipeline.push({
//             $sort: { [sortFieldMap[sortBy] || "requestedAt"]: sortDirection }
//         });

//         // Stage 10: Count total before pagination
//         const countPipeline = [...pipeline];
//         countPipeline.push({ $count: "total" });

//         // Stage 11: Pagination
//         const skip = (parseInt(page) - 1) * parseInt(limit);
//         pipeline.push(
//             { $skip: skip },
//             { $limit: parseInt(limit) }
//         );

//         // Execute pipelines
//         const [results, countResult] = await Promise.all([
//             Order.aggregate(pipeline),
//             Order.aggregate(countPipeline)
//         ]);

//         const total = countResult[0]?.total || 0;
//         const totalPages = Math.ceil(total / parseInt(limit));

//         // Stage 12: Calculate summary statistics
//         const statsPipeline = [
//             { $match: { "shipments.returns": { $exists: true, $ne: [] } } },
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" }
//         ];

//         if (Object.keys(matchStage).length > 0) {
//             statsPipeline.push({ $match: matchStage });
//         }

//         statsPipeline.push(
//             {
//                 $group: {
//                     _id: null,
//                     totalReturns: { $sum: 1 },
//                     totalRefundAmount: { $sum: "$shipments.returns.refund.amount" },
//                     returnCounts: {
//                         $push: {
//                             status: "$shipments.returns.status",
//                             type: "$shipments.returns.type",
//                             reason: "$shipments.returns.reason"
//                         }
//                     }
//                 }
//             },
//             {
//                 $project: {
//                     totalReturns: 1,
//                     totalRefundAmount: 1,
//                     statusBreakdown: {
//                         $arrayToObject: {
//                             $map: {
//                                 input: {
//                                     $setUnion: "$returnCounts.status"
//                                 },
//                                 as: "status",
//                                 in: {
//                                     k: "$$status",
//                                     v: {
//                                         $size: {
//                                             $filter: {
//                                                 input: "$returnCounts",
//                                                 as: "ret",
//                                                 cond: { $eq: ["$$ret.status", "$$status"] }
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     },
//                     typeBreakdown: {
//                         $arrayToObject: {
//                             $map: {
//                                 input: {
//                                     $setUnion: "$returnCounts.type"
//                                 },
//                                 as: "type",
//                                 in: {
//                                     k: "$$type",
//                                     v: {
//                                         $size: {
//                                             $filter: {
//                                                 input: "$returnCounts",
//                                                 as: "ret",
//                                                 cond: { $eq: ["$$ret.type", "$$type"] }
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     },
//                     reasonBreakdown: {
//                         $arrayToObject: {
//                             $map: {
//                                 input: {
//                                     $setUnion: "$returnCounts.reason"
//                                 },
//                                 as: "reason",
//                                 in: {
//                                     k: "$$reason",
//                                     v: {
//                                         $size: {
//                                             $filter: {
//                                                 input: "$returnCounts",
//                                                 as: "ret",
//                                                 cond: { $eq: ["$$ret.reason", "$$reason"] }
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     }
//                 }
//             }
//         );

//         const statsResult = await Order.aggregate(statsPipeline);
//         const stats = statsResult[0] || {
//             totalReturns: 0,
//             totalRefundAmount: 0,
//             statusBreakdown: {},
//             typeBreakdown: {},
//             reasonBreakdown: {}
//         };

//         // Calculate average processing time
//         const processingTimePipeline = [
//             { $match: { "shipments.returns.status": "refunded" } },
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             { $match: { "shipments.returns.status": "refunded" } },
//             {
//                 $addFields: {
//                     processingTime: {
//                         $divide: [
//                             { $subtract: ["$shipments.returns.timelines.refunded_at", "$shipments.returns.timelines.requested_at"] },
//                             1000 * 60 * 60 // Convert to hours
//                         ]
//                     }
//                 }
//             },
//             {
//                 $group: {
//                     _id: null,
//                     avgProcessingTime: { $avg: "$processingTime" },
//                     minProcessingTime: { $min: "$processingTime" },
//                     maxProcessingTime: { $max: "$processingTime" },
//                     totalProcessed: { $sum: 1 }
//                 }
//             }
//         ];

//         const processingStats = await Order.aggregate(processingTimePipeline);
//         const processingData = processingStats[0] || {
//             avgProcessingTime: 0,
//             minProcessingTime: 0,
//             maxProcessingTime: 0,
//             totalProcessed: 0
//         };

//         return res.json({
//             success: true,
//             data: {
//                 returns: results,
//                 pagination: {
//                     page: parseInt(page),
//                     limit: parseInt(limit),
//                     total,
//                     totalPages,
//                     hasNextPage: parseInt(page) < totalPages,
//                     hasPrevPage: parseInt(page) > 1
//                 },
//                 summary: {
//                     totalReturns: stats.totalReturns,
//                     totalRefundAmount: stats.totalRefundAmount,
//                     statusBreakdown: stats.statusBreakdown,
//                     typeBreakdown: stats.typeBreakdown,
//                     reasonBreakdown: stats.reasonBreakdown,
//                     processingMetrics: {
//                         averageProcessingTime: Math.round(processingData.avgProcessingTime * 100) / 100,
//                         minProcessingTime: Math.round(processingData.minProcessingTime * 100) / 100,
//                         maxProcessingTime: Math.round(processingData.maxProcessingTime * 100) / 100,
//                         totalProcessed: processingData.totalProcessed
//                     }
//                 },
//                 filters: {
//                     applied: {
//                         status,
//                         type,
//                         reason,
//                         startDate,
//                         endDate,
//                         orderId,
//                         userId,
//                         search
//                     },
//                     available: {
//                         statuses: await getUniqueStatuses(),
//                         types: ["return", "replace"],
//                         reasons: await getUniqueReasons()
//                     }
//                 }
//             }
//         });

//     } catch (error) {
//         console.error("Admin returns summary error:", error);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to fetch returns summary",
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };
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
        if (reason) match["shipments.returns.reason"] = reason;

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
                    reason: "$shipments.returns.reason",
                    requestedAt: "$shipments.returns.requestedAt",
                    refundAmount: "$shipments.returns.refund.amount",

                    orderId: 1,
                    customOrderId: 1,
                    customerName: 1,

                    shipmentId: "$shipments.shipment_id",
                    awb: "$shipments.awb_code",

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

// /**
//  * GET /admin/returns/:returnId
//  * Get detailed view of a single return/replacement
//  */
// export const getReturnDetails = async (req, res) => {
//     try {
//         const { returnId } = req.params;
//         const pipeline = [
//             // Match orders with the specific return
//             {
//                 $match: {
//                     "shipments.returns._id": new mongoose.Types.ObjectId(returnId)
//                 }
//             },

//             // Unwind shipments and returns
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },

//             // Match the specific return
//             {
//                 $match: {
//                     "shipments.returns._id": new mongoose.Types.ObjectId(returnId)
//                 }
//             },

//             // Lookup user details
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "user",
//                     foreignField: "_id",
//                     as: "userDetails"
//                 }
//             },
//             { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },

//             // Lookup admin details for QC
//             {
//                 $lookup: {
//                     from: "admins",
//                     localField: "shipments.returns.qc.checkedBy",
//                     foreignField: "_id",
//                     as: "qcAdminDetails"
//                 }
//             },
//             { $unwind: { path: "$qcAdminDetails", preserveNullAndEmptyArrays: true } },

//             // Lookup product details for each item
//             {
//                 $lookup: {
//                     from: "products",
//                     localField: "shipments.returns.items.productId",
//                     foreignField: "_id",
//                     as: "productDetails"
//                 }
//             },

//             // Lookup for replacement products
//             {
//                 $lookup: {
//                     from: "products",
//                     localField: "shipments.returns.replacement.replacementProductId",
//                     foreignField: "_id",
//                     as: "replacementProductDetails"
//                 }
//             },
//             { $unwind: { path: "$replacementProductDetails", preserveNullAndEmptyArrays: true } },

//             // Format the response
//             {
//                 $project: {
//                     returnDetails: {
//                         _id: "$shipments.returns._id",
//                         type: "$shipments.returns.type",
//                         status: "$shipments.returns.status",
//                         reason: "$shipments.returns.reason",
//                         description: "$shipments.returns.description",
//                         requestedAt: "$shipments.returns.requestedAt",
//                         requestedBy: "$shipments.returns.requestedBy",

//                         // Pickup details
//                         pickup_details: "$shipments.returns.pickup_details",

//                         // Warehouse details
//                         warehouse_details: "$shipments.returns.warehouse_details",

//                         // Shiprocket details
//                         shiprocket_order_id: "$shipments.returns.shiprocket_order_id",
//                         shipment_id: "$shipments.returns.shipment_id",
//                         awb_code: "$shipments.returns.awb_code",
//                         courier_name: "$shipments.returns.courier_name",
//                         tracking_url: "$shipments.returns.tracking_url",

//                         // Items with product details
//                         items: {
//                             $map: {
//                                 input: "$shipments.returns.items",
//                                 as: "item",
//                                 in: {
//                                     _id: "$$item._id",
//                                     productId: "$$item.productId",
//                                     quantity: "$$item.quantity",
//                                     variant: "$$item.variant",
//                                     reason: "$$item.reason",
//                                     reasonDescription: "$$item.reasonDescription",
//                                     images: "$$item.images",
//                                     condition: "$$item.condition",
//                                     status: "$$item.status",
//                                     productDetails: {
//                                         $arrayElemAt: [
//                                             {
//                                                 $filter: {
//                                                     input: "$productDetails",
//                                                     as: "product",
//                                                     cond: { $eq: ["$$product._id", "$$item.productId"] }
//                                                 }
//                                             },
//                                             0
//                                         ]
//                                     }
//                                 }
//                             }
//                         },

//                         // Tracking history
//                         tracking_history: "$shipments.returns.tracking_history",

//                         // QC details
//                         qc: {
//                             checkedBy: "$shipments.returns.qc.checkedBy",
//                             checkedAt: "$shipments.returns.qc.checkedAt",
//                             notes: "$shipments.returns.qc.notes",
//                             images: "$shipments.returns.qc.images",
//                             status: "$shipments.returns.qc.status",
//                             checkedByAdmin: {
//                                 _id: "$qcAdminDetails._id",
//                                 name: "$qcAdminDetails.name",
//                                 email: "$qcAdminDetails.email"
//                             }
//                         },

//                         // Refund details
//                         refund: "$shipments.returns.refund",

//                         // Replacement details
//                         replacement: {
//                             status: "$shipments.returns.replacement?.status",
//                             replacementProductId: "$shipments.returns.replacement?.replacementProductId",
//                             replacementProductDetails: "$replacementProductDetails",
//                             replacementShipmentId: "$shipments.returns.replacement?.replacementShipmentId",
//                             expectedDelivery: "$shipments.returns.replacement?.expectedDelivery",
//                             notes: "$shipments.returns.replacement?.notes"
//                         },

//                         // Audit trail
//                         audit_trail: "$shipments.returns.audit_trail",

//                         // Timelines
//                         timelines: {
//                             requested_at: "$shipments.returns.timelines?.requested_at",
//                             under_review_at: "$shipments.returns.timelines?.under_review_at",
//                             approved_at: "$shipments.returns.timelines?.approved_at",
//                             pickup_scheduled_at: "$shipments.returns.timelines?.pickup_scheduled_at",
//                             picked_up_at: "$shipments.returns.timelines?.picked_up_at",
//                             delivered_to_warehouse_at: "$shipments.returns.timelines?.delivered_to_warehouse_at",
//                             qc_completed_at: "$shipments.returns.timelines?.qc_completed_at",
//                             refund_initiated_at: "$shipments.returns.timelines?.refund_initiated_at",
//                             refunded_at: "$shipments.returns.timelines?.refunded_at",
//                             replacement_shipped_at: "$shipments.returns.timelines?.replacement_shipped_at",
//                             cancelled_at: "$shipments.returns.timelines?.cancelled_at"
//                         },

//                         // Flags
//                         flags: "$shipments.returns.flags",

//                         // External references
//                         external_references: "$shipments.returns.external_references",

//                         // Documents
//                         documents: "$shipments.returns.documents",

//                         // Communications
//                         communications: "$shipments.returns.communications",

//                         // Created/Updated
//                         createdAt: "$shipments.returns.createdAt",
//                         updatedAt: "$shipments.returns.updatedAt"
//                     },

//                     orderDetails: {
//                         _id: "$_id",
//                         orderId: "$orderId",
//                         orderNumber: "$orderNumber",
//                         customOrderId: "$customOrderId",
//                         customerName: "$customerName",
//                         totalAmount: "$amount",
//                         paymentStatus: "$paymentStatus",
//                         orderStatus: "$orderStatus",
//                         paymentMethod: "$paymentMethod",
//                         createdAt: "$createdAt",

//                         // Shipping details
//                         shippingAddress: "$shippingAddress",

//                         // Products in original order
//                         originalProducts: {
//                             $map: {
//                                 input: "$products",
//                                 as: "product",
//                                 in: {
//                                     productId: "$$product.productId",
//                                     quantity: "$$product.quantity",
//                                     price: "$$product.price",
//                                     variant: "$$product.variant",
//                                     productDetails: {
//                                         $arrayElemAt: [
//                                             {
//                                                 $filter: {
//                                                     input: "$productDetails",
//                                                     as: "prodDetail",
//                                                     cond: { $eq: ["$$prodDetail._id", "$$product.productId"] }
//                                                 }
//                                             },
//                                             0
//                                         ]
//                                     }
//                                 }
//                             }
//                         }
//                     },

//                     shipmentDetails: {
//                         shipmentId: "$shipments.shipment_id",
//                         shiprocketOrderId: "$shipments.shiprocket_order_id",
//                         awbCode: "$shipments.awb_code",
//                         courierName: "$shipments.courier_name",
//                         trackingUrl: "$shipments.tracking_url",
//                         status: "$shipments.status",
//                         deliveredAt: "$shipments.deliveredAt",
//                         expectedDelivery: "$shipments.expected_delivery",
//                         products: "$shipments.products"
//                     },

//                     userDetails: {
//                         _id: "$userDetails._id",
//                         name: "$userDetails.name",
//                         email: "$userDetails.email",
//                         phone: "$userDetails.phone",
//                         address: "$userDetails.address",
//                         returnHistory: {
//                             totalReturns: "$userDetails.returnStats?.totalReturns || 0",
//                             totalRefunds: "$userDetails.returnStats?.totalRefunds || 0"
//                         }
//                     },

//                     // Analytics for this return
//                     analytics: {
//                         totalItems: { $size: "$shipments.returns.items" },
//                         totalQuantity: {
//                             $sum: "$shipments.returns.items.quantity"
//                         },
//                         totalValue: {
//                             $sum: {
//                                 $map: {
//                                     input: "$shipments.returns.items",
//                                     as: "item",
//                                     in: {
//                                         $multiply: [
//                                             { $ifNull: ["$$item.originalPrice", 0] },
//                                             { $ifNull: ["$$item.quantity", 0] }
//                                         ]
//                                     }
//                                 }
//                             }
//                         },
//                         processingTime: {
//                             $cond: {
//                                 if: {
//                                     $and: [
//                                         "$shipments.returns.timelines.requested_at",
//                                         "$shipments.returns.timelines.refunded_at"
//                                     ]
//                                 },
//                                 then: {
//                                     $divide: [
//                                         {
//                                             $subtract: [
//                                                 "$shipments.returns.timelines.refunded_at",
//                                                 "$shipments.returns.timelines.requested_at"
//                                             ]
//                                         },
//                                         1000 * 60 * 60 // Convert to hours
//                                     ]
//                                 },
//                                 else: null
//                             }
//                         }
//                     }
//                 }
//             }
//         ];

//         const result = await Order.aggregate(pipeline);

//         if (!result || result.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return request not found"
//             });
//         }

//         const returnData = result[0];

//         // Get related returns for the same order/shipment
//         const relatedReturns = await Order.aggregate([
//             {
//                 $match: {
//                     _id: returnData.orderDetails._id
//                 }
//             },
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             {
//                 $match: {
//                     "shipments.returns._id": { $ne: new mongoose.Types.ObjectId(returnId) }
//                 }
//             },
//             {
//                 $project: {
//                     _id: "$shipments.returns._id",
//                     type: "$shipments.returns.type",
//                     status: "$shipments.returns.status",
//                     reason: "$shipments.returns.reason",
//                     requestedAt: "$shipments.returns.requestedAt",
//                     totalItems: { $size: "$shipments.returns.items" }
//                 }
//             }
//         ]);

//         return res.json({
//             success: true,
//             data: {
//                 ...returnData,
//                 relatedReturns,
//                 nextActions: getNextActions(returnData.returnDetails.status, returnData.returnDetails.type)
//             }
//         });

//     } catch (error) {
//         console.error("Admin return details error:", error);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to fetch return details",
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };
export const getReturnDetails = async (req, res) => {
    try {
        const returnId = new mongoose.Types.ObjectId(req.params.returnId);

        const pipeline = [
            { $match: { "shipments.returns._id": returnId } },
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            { $match: { "shipments.returns._id": returnId } },

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
                        requestedAt: "$shipments.returns.requestedAt",
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
                        shipmentId: "$shipments.shipment_id",
                        awb: "$shipments.awb_code",
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


/**
 * GET /admin/returns/analytics
 * Get detailed analytics for returns
 */
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
                { $match: { "shipments.returns.requestedAt": dateFilter } }
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
                { $match: { "shipments.returns.requestedAt": dateFilter } }
            ] : []),
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: groupByFormat,
                            date: "$shipments.returns.requestedAt"
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
                { $match: { "shipments.returns.requestedAt": dateFilter } }
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

        // 4. Reason distribution
        const reasonDistribution = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            ...(Object.keys(dateFilter).length > 0 ? [
                { $match: { "shipments.returns.requestedAt": dateFilter } }
            ] : []),
            {
                $group: {
                    _id: "$shipments.returns.reason",
                    count: { $sum: 1 },
                    percentage: { $avg: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const productReturns = await Order.aggregate([
            { $unwind: "$shipments" },
            { $unwind: "$shipments.returns" },
            { $unwind: "$shipments.returns.items" },

            ...(Object.keys(dateFilter).length > 0 ? [{
                $match: { "shipments.returns.requestedAt": dateFilter }
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
                { $match: { "shipments.returns.requestedAt": dateFilter } }
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

