
// // // controllers/shipmentReturnController.js
// // import mongoose from "mongoose";
// // import Order from "../models/Order.js";
// // import User from "../models/User.js";
// // import { createShiprocketReturnOrder } from "../middlewares/services/shiprocket.js";
// // import { uploadToCloudinary } from "../middlewares/upload.js";
// // import { sendEmail } from "../middlewares/utils/emailService.js";
// // import { addRefundJob } from "../middlewares/services/refundQueue.js";

// // // ✅ Helper to validate ObjectId
// // const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// // // ---------------------- USER ENDPOINTS ----------------------

// // export const requestShipmentReturn = async (req, res) => {
// //     try {
// //         const userId = req.user._id;
// //         const { shipment_id } = req.params; 
// //         const { items, reason, reasonDescription = "" } = req.body;

// //         if (!shipment_id) {
// //             return res.status(400).json({ success: false, message: "shipment_id is required" });
// //         }

// //         // FIND ORDER
// //         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         // USER OWNERSHIP
// //         if (order.user.toString() !== userId.toString()) {
// //             return res.status(403).json({ success: false, message: "Not your shipment" });
// //         }

// //         // RETURN WINDOW
// //         const deliveredAt = shipment.deliveredAt || order.deliveredAt || order.updatedAt;
// //         const allowedDays = order.returnPolicy?.days || 7;
// //         const diffDays = Math.floor((Date.now() - new Date(deliveredAt)) / 86400000);

// //         if (diffDays > allowedDays) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: `Return window expired (${allowedDays} days)`
// //             });
// //         }

// //         // ITEMS REQUIRED
// //         if (!Array.isArray(items) || items.length === 0) {
// //             return res.status(400).json({ success: false, message: "Items are required" });
// //         }

// //         const validatedItems = [];

// //         for (const item of items) {
// //             const { productId, quantity, variant, condition } = item;

// //             if (!productId)
// //                 return res.status(400).json({ success: false, message: "Invalid productId" });

// //             const found = shipment.products.find(p => {
// //                 if (variant) {
// //                     return (
// //                         p.productId.toString() === productId &&
// //                         p.variant?.sku === variant.sku
// //                     );
// //                 }
// //                 return p.productId.toString() === productId;
// //             });

// //             if (!found)
// //                 return res.status(400).json({
// //                     success: false,
// //                     message: "Item does not belong to this shipment"
// //                 });

// //             if (quantity > found.quantity)
// //                 return res.status(400).json({
// //                     success: false,
// //                     message: "Invalid quantity requested"
// //                 });

// //             // Duplicate check
// //             const duplicate = shipment.returns?.some(r =>
// //                 r.items.some(i =>
// //                     i.productId.toString() === productId &&
// //                     (!variant || i.variant?.sku === variant.sku) &&
// //                     i.status !== "cancelled"
// //                 )
// //             );

// //             if (duplicate)
// //                 return res.status(400).json({
// //                     success: false,
// //                     message: `Return already requested for product ${productId}`
// //                 });

// //             // IMAGES
// //             let uploadedImages = [];
// //             const fieldKey = `images_${productId}`;

// //             if (req.files && req.files[fieldKey]) {
// //                 const imgFiles = req.files[fieldKey];
// //                 for (const img of imgFiles) {
// //                     const result = await uploadToCloudinary(
// //                         img.buffer,
// //                         `returns/${shipment_id}/${productId}`
// //                     );
// //                     uploadedImages.push(result.secure_url ?? result);
// //                 }
// //             }

// //             validatedItems.push({
// //                 _id: new mongoose.Types.ObjectId(),
// //                 productId,
// //                 quantity,
// //                 ...(variant ? { variant } : {}),
// //                 reason,
// //                 reasonDescription,
// //                 images: uploadedImages,
// //                 condition: condition || "Unopened",
// //                 status: "requested"
// //             });
// //         }

// //         // FINAL RETURN ENTRY (MATCHES YOUR SCHEMA)
// //         const returnEntry = {
// //             _id: new mongoose.Types.ObjectId(),

// //             shiprocket_order_id: null,
// //             shipment_id: shipment_id,
// //             awb_code: null,
// //             courier_name: null,
// //             tracking_url: null,

// //             status: "requested",

// //             pickup_details: {},
// //             warehouse_details: {},

// //             items: validatedItems,

// //             tracking_history: [],
// //             qc: {
// //                 checkedBy: null,
// //                 checkedAt: null,
// //                 notes: "",
// //                 images: [],
// //                 status: null
// //             },

// //             refund: {
// //                 amount: 0,
// //                 status: "pending",
// //                 gatewayRefundId: null,
// //                 refundedAt: null
// //             },

// //             audit_trail: [
// //                 {
// //                     status: "requested",
// //                     action: "Return Requested",
// //                     performedBy: userId,
// //                     performedByModel: "User",
// //                     timestamp: new Date(),
// //                     notes: reasonDescription,
// //                     metadata: {}
// //                 }
// //             ],

// //             requestedBy: userId,
// //             requestedAt: new Date(),
// //             reason,
// //             description: reasonDescription
// //         };

// //         if (!shipment.returns) shipment.returns = [];
// //         shipment.returns.push(returnEntry);

// //         await order.save();

// //         // EMAIL
// //         if (order.user?.email) {
// //             await sendEmail(
// //                 order.user.email,
// //                 `Return Request Received - Shipment ${shipment.shipment_id}`,
// //                 `<p>Your return request for Shipment #${shipment.shipment_id} has been received.</p>`
// //             );
// //         }

// //         return res.status(201).json({
// //             success: true,
// //             message: "Return request submitted",
// //             returnId: returnEntry._id,
// //             data: returnEntry
// //         });

// //     } catch (err) {
// //         console.error("Return Request Error:", err);
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// // export const getMyShipmentReturns = async (req, res) => {
// //     try {
// //         const userId = req.user._id;

// //         const orders = await Order.find({
// //             user: userId,
// //             "shipments.returns.0": { $exists: true }
// //         })
// //             .select("shipments createdAt")
// //             .sort({ createdAt: -1 });

// //         const flattened = [];

// //         for (const o of orders) {
// //             for (const s of o.shipments || []) {
// //                 if (!s.returns?.length) continue;

// //                 for (const r of s.returns) {
// //                     flattened.push({
// //                         shipmentId: s.shipment_id,
// //                         shipmentCode: s.shipment_id,
// //                         return: r
// //                     });
// //                 }
// //             }
// //         }

// //         return res.json({ success: true, data: flattened });

// //     } catch (err) {
// //         console.error("getMyShipmentReturns Error:", err);
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// // export const getShipmentReturnDetails = async (req, res) => {
// //     try {
// //         const { shipment_id, returnId } = req.params;

// //         if (!mongoose.Types.ObjectId.isValid(returnId)) {
// //             return res.status(400).json({ success: false, message: "Invalid returnId" });
// //         }

// //         const order = await Order.findOne({
// //             "shipments.shipment_id": shipment_id
// //         }).populate("user", "name email");

// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const ret = shipment.returns.id(returnId);
// //         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

// //         // Access allowed for user or admin
// //         if (
// //             req.user &&
// //             order.user._id.toString() !== req.user._id.toString() &&
// //             !(req.admin && req.admin._id)
// //         ) {
// //             return res.status(403).json({ success: false, message: "Not authorized" });
// //         }

// //         return res.json({
// //             success: true,
// //             data: { shipmentCode: shipment.shipment_id, return: ret }
// //         });

// //     } catch (err) {
// //         console.error("getShipmentReturnDetails Error:", err);
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// // export const cancelShipmentReturn = async (req, res) => {
// //     try {
// //         const userId = req.user._id;
// //         const { shipment_id, returnId } = req.params;

// //         if (!mongoose.Types.ObjectId.isValid(returnId)) {
// //             return res.status(400).json({ success: false, message: "Invalid returnId" });
// //         }

// //         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         if (order.user.toString() !== userId.toString()) {
// //             return res.status(403).json({ success: false, message: "Not your shipment" });
// //         }

// //         const ret = shipment.returns.id(returnId);
// //         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

// //         if (ret.status !== "requested") {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "Cannot cancel after processing"
// //             });
// //         }

// //         ret.status = "cancelled";

// //         if (!ret.tracking_history) ret.tracking_history = [];
// //         if (!ret.audit_trail) ret.audit_trail = [];

// //         // tracking entry
// //         ret.tracking_history.push({
// //             status: "cancelled",
// //             timestamp: new Date(),
// //             location: "User",
// //             description: req.body?.notes || "User cancelled the return"
// //         });

// //         // audit entry
// //         ret.audit_trail.push({
// //             status: "cancelled",
// //             action: "user_cancelled",
// //             performedBy: userId,
// //             performedByModel: "User",
// //             timestamp: new Date(),
// //             notes: req.body?.notes || "User cancelled the return"
// //         });

// //         await order.save();

// //         if (order.user?.email) {
// //             await sendEmail(
// //                 order.user.email,
// //                 `Return Cancelled - Shipment ${shipment.shipment_id}`,
// //                 `<p>Your return request has been cancelled.</p>`
// //             );
// //         }

// //         return res.json({
// //             success: true,
// //             message: "Return cancelled successfully"
// //         });

// //     } catch (err) {
// //         console.error("cancelShipmentReturn Error:", err);
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// // // ---------------------- ADMIN ENDPOINTS ----------------------

// // export const approveShipmentReturn = async (req, res) => {
// //     try {
// //         const { shipment_id, returnId } = req.params;

// //         // Find order + shipment + return
// //         const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const ret = shipment.returns.id(returnId);
// //         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

// //         // CHECK actual schema field
// //         if (ret.status !== "requested") {
// //             return res.status(400).json({ success: false, message: "Return already processed" });
// //         }

// //         // Create Shiprocket Return Order
// //         let shiprocketResult;
// //         try {
// //             shiprocketResult = await createShiprocketReturnOrder(order, ret);

// //             ret.shiprocket_order_id = shiprocketResult.order_id;
// //             ret.shipment_id = shiprocketResult.shipment_id;

// //             ret.status = "pickup_scheduled";

// //             // Add tracking history (Exists in model)
// //             ret.tracking_history.push({
// //                 status: "pickup_scheduled",
// //                 timestamp: new Date(),
// //                 location: "System",
// //                 description: "Return pickup scheduled by Shiprocket"
// //             });

// //         } catch (err) {
// //             return res.status(422).json({
// //                 success: false,
// //                 message: "Failed to create Shiprocket return order",
// //                 error: err.message
// //             });
// //         }

// //         // Audit trail (Exists in model)
// //         ret.audit_trail.push({
// //             status: "approved",
// //             action: "admin_approved",
// //             performedBy: req.admin?._id,
// //             performedByModel: "Admin",
// //             timestamp: new Date()
// //         });

// //         await order.save();

// //         // Notify user
// //         if (order.user?.email) {
// //             await sendEmail(
// //                 order.user.email,
// //                 "Return Approved",
// //                 `<p>Your return request for Shipment #${shipment.shipment_id} has been approved.</p>`
// //             );
// //         }

// //         return res.json({ success: true, message: "Return approved", shiprocket: shiprocketResult });

// //     } catch (err) {
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// // export const markShipmentReturnReceived = async (req, res) => {
// //     try {
// //         const { shipment_id, returnId } = req.params;

// //         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const ret = shipment.returns.id(returnId);
// //         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

// //         if (["received_at_warehouse", "refunded"].includes(ret.overallStatus)) {
// //             return res.status(400).json({ success: false, message: "Already processed" });
// //         }

// //         ret.overallStatus = "received_at_warehouse";
// //         ret.receivedAt = new Date();

// //         if (!ret.auditTrail) ret.auditTrail = [];
// //         if (!ret.timeline) ret.timeline = [];

// //         // Audit
// //         ret.auditTrail.push({
// //             status: "received_at_warehouse",
// //             action: "admin_mark_received",
// //             performedBy: req.admin._id,
// //             performedByModel: "Admin",
// //             timestamp: new Date(),
// //             notes: req.body?.notes || "Received at warehouse"
// //         });

// //         // Timeline
// //         ret.timeline.push({
// //             status: "received_at_warehouse",
// //             timestamp: new Date(),
// //             location: "Warehouse",
// //             description: req.body?.notes || "Return received at warehouse"
// //         });

// //         await order.save();

// //         // Add refund job
// //         await addRefundJob(order._id, {
// //             shipment_id: shipment.shipment_id,
// //             returnId: ret._id,
// //             amount: ret.refund?.amount || order.amount
// //         });

// //         // Notify customer
// //         if (order.user?.email) {
// //             await sendEmail(
// //                 order.user.email,
// //                 `Return Received`,
// //                 `<p>Your returned item(s) for Shipment #${shipment.shipment_id} were received.</p>`
// //             );
// //         }

// //         return res.json({ success: true, message: "Return received – refund initiated" });

// //     } catch (err) {
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// // export const rejectShipmentReturn = async (req, res) => {
// //     try {
// //         const { shipment_id, returnId } = req.params;
// //         const { reason } = req.body;

// //         const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const ret = shipment.returns.id(returnId);
// //         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

// //         if (ret.overallStatus !== "requested") {
// //             return res.status(400).json({ success: false, message: "Already processed" });
// //         }

// //         ret.overallStatus = "rejected";
// //         ret.adminRejectionReason = reason;

// //         if (!ret.auditTrail) ret.auditTrail = [];
// //         if (!ret.timeline) ret.timeline = [];

// //         ret.auditTrail.push({
// //             status: "rejected",
// //             action: "admin_rejected",
// //             notes: reason,
// //             performedBy: req.admin?._id,
// //             performedByModel: "Admin",
// //             timestamp: new Date()
// //         });

// //         ret.timeline.push({
// //             status: "rejected",
// //             timestamp: new Date(),
// //             location: "Admin",
// //             description: reason
// //         });

// //         await order.save();

// //         if (order.user?.email) {
// //             await sendEmail(
// //                 order.user.email,
// //                 `Return Rejected`,
// //                 `<p>Your return request for Shipment #${shipment.shipment_id} has been rejected.</p><p>Reason: ${reason}</p>`
// //             );
// //         }

// //         return res.json({ success: true, message: "Return rejected" });

// //     } catch (err) {
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };








// // the above part is complete now do more validation and things at saturday ,13-12-2025





// // controllers/shipmentReturnController.js
// import mongoose from "mongoose";
// import Order from "../models/Order.js";
// import User from "../models/User.js";
// import { createShiprocketReturnOrder } from "../middlewares/services/shiprocket.js";
// import { uploadToCloudinary } from "../middlewares/upload.js";
// import { sendEmail } from "../middlewares/utils/emailService.js";
// import { addRefundJob } from "../middlewares/services/refundQueue.js";


// export const RETURN_REASON_RULES = {
//     DAMAGED: { imagesRequired: true },
//     WRONG_ITEM: { imagesRequired: true },
//     EXPIRED: { imagesRequired: true },
//     QUALITY_ISSUE: { imagesRequired: true },
//     SIZE_ISSUE: { imagesRequired: false },
//     NO_LONGER_NEEDED: { imagesRequired: false }
// };


// const MAX_IMAGES_PER_ITEM = 5;



// // ✅ Helper to validate ObjectId
// const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// // ---------------------- USER ENDPOINTS ----------------------

// // export const requestShipmentReturn = async (req, res) => {
// //     try {
// //         const userId = req.user._id;
// //         const { shipment_id } = req.params; 
// //         const { items, reason, reasonDescription = "" } = req.body;

// //         if (!shipment_id) {
// //             return res.status(400).json({ success: false, message: "shipment_id is required" });
// //         }

// //         // FIND ORDER
// //         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         // USER OWNERSHIP
// //         if (order.user.toString() !== userId.toString()) {
// //             return res.status(403).json({ success: false, message: "Not your shipment" });
// //         }

// //         // RETURN WINDOW
// //         const deliveredAt = shipment.deliveredAt || order.deliveredAt || order.updatedAt;
// //         const allowedDays = order.returnPolicy?.days || 7;
// //         const diffDays = Math.floor((Date.now() - new Date(deliveredAt)) / 86400000);

// //         if (diffDays > allowedDays) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: `Return window expired (${allowedDays} days)`
// //             });
// //         }

// //         // ITEMS REQUIRED
// //         if (!Array.isArray(items) || items.length === 0) {
// //             return res.status(400).json({ success: false, message: "Items are required" });
// //         }

// //         const validatedItems = [];

// //         for (const item of items) {
// //             const { productId, quantity, variant, condition } = item;

// //             if (!productId)
// //                 return res.status(400).json({ success: false, message: "Invalid productId" });

// //             const found = shipment.products.find(p => {
// //                 if (variant) {
// //                     return (
// //                         p.productId.toString() === productId &&
// //                         p.variant?.sku === variant.sku
// //                     );
// //                 }
// //                 return p.productId.toString() === productId;
// //             });

// //             if (!found)
// //                 return res.status(400).json({
// //                     success: false,
// //                     message: "Item does not belong to this shipment"
// //                 });

// //             if (quantity > found.quantity)
// //                 return res.status(400).json({
// //                     success: false,
// //                     message: "Invalid quantity requested"
// //                 });

// //             // Duplicate check
// //             const duplicate = shipment.returns?.some(r =>
// //                 r.items.some(i =>
// //                     i.productId.toString() === productId &&
// //                     (!variant || i.variant?.sku === variant.sku) &&
// //                     i.status !== "cancelled"
// //                 )
// //             );

// //             if (duplicate)
// //                 return res.status(400).json({
// //                     success: false,
// //                     message: `Return already requested for product ${productId}`
// //                 });

// //             // IMAGES
// //             let uploadedImages = [];
// //             const fieldKey = `images_${productId}`;

// //             if (req.files && req.files[fieldKey]) {
// //                 const imgFiles = req.files[fieldKey];
// //                 for (const img of imgFiles) {
// //                     const result = await uploadToCloudinary(
// //                         img.buffer,
// //                         `returns/${shipment_id}/${productId}`
// //                     );
// //                     uploadedImages.push(result.secure_url ?? result);
// //                 }
// //             }

// //             validatedItems.push({
// //                 _id: new mongoose.Types.ObjectId(),
// //                 productId,
// //                 quantity,
// //                 ...(variant ? { variant } : {}),
// //                 reason,
// //                 reasonDescription,
// //                 images: uploadedImages,
// //                 condition: condition || "Unopened",
// //                 status: "requested"
// //             });
// //         }

// //         // FINAL RETURN ENTRY (MATCHES YOUR SCHEMA)
// //         const returnEntry = {
// //             _id: new mongoose.Types.ObjectId(),

// //             shiprocket_order_id: null,
// //             shipment_id: shipment_id,
// //             awb_code: null,
// //             courier_name: null,
// //             tracking_url: null,

// //             status: "requested",

// //             pickup_details: {},
// //             warehouse_details: {},

// //             items: validatedItems,

// //             tracking_history: [],
// //             qc: {
// //                 checkedBy: null,
// //                 checkedAt: null,
// //                 notes: "",
// //                 images: [],
// //                 status: null
// //             },

// //             refund: {
// //                 amount: 0,
// //                 status: "pending",
// //                 gatewayRefundId: null,
// //                 refundedAt: null
// //             },

// //             audit_trail: [
// //                 {
// //                     status: "requested",
// //                     action: "Return Requested",
// //                     performedBy: userId,
// //                     performedByModel: "User",
// //                     timestamp: new Date(),
// //                     notes: reasonDescription,
// //                     metadata: {}
// //                 }
// //             ],

// //             requestedBy: userId,
// //             requestedAt: new Date(),
// //             reason,
// //             description: reasonDescription
// //         };

// //         if (!shipment.returns) shipment.returns = [];
// //         shipment.returns.push(returnEntry);

// //         await order.save();

// //         // EMAIL
// //         if (order.user?.email) {
// //             await sendEmail(
// //                 order.user.email,
// //                 `Return Request Received - Shipment ${shipment.shipment_id}`,
// //                 `<p>Your return request for Shipment #${shipment.shipment_id} has been received.</p>`
// //             );
// //         }

// //         return res.status(201).json({
// //             success: true,
// //             message: "Return request submitted",
// //             returnId: returnEntry._id,
// //             data: returnEntry
// //         });

// //     } catch (err) {
// //         console.error("Return Request Error:", err);
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// export const requestShipmentReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { shipment_id } = req.params;
//         const {
//             items,
//             reason,
//             reasonDescription = "",
//             type
//         } = req.body;

//         if (!shipment_id) {
//             return res.status(400).json({ success: false, message: "shipment_id is required" });
//         }

//         if (!["return", "replace"].includes(type)) {
//             return res.status(400).json({ success: false, message: "Invalid return type" });
//         }

//         // 1️⃣ FIND ORDER & SHIPMENT
//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         // 2️⃣ OWNERSHIP CHECK
//         if (order.user.toString() !== userId.toString()) {
//             return res.status(403).json({ success: false, message: "Not your shipment" });
//         }

//         // 3️⃣ MUST BE DELIVERED
//         if (!shipment.deliveredAt && shipment.status !== "Delivered") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Return allowed only after delivery"
//             });
//         }

//         // 4️⃣ RETURN WINDOW
//         const deliveredAt = shipment.deliveredAt;
//         const allowedDays = order.returnPolicy?.days || 7;
//         const diffDays = Math.floor((Date.now() - new Date(deliveredAt)) / 86400000);

//         if (diffDays > allowedDays) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Return window expired (${allowedDays} days)`
//             });
//         }

//         // 5️⃣ ITEMS VALIDATION
//         if (!Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({ success: false, message: "Items are required" });
//         }

//         const validatedItems = [];

//         for (const item of items) {
//             const { productId, quantity, variant, condition } = item;

//             if (!productId || !quantity || quantity <= 0) {
//                 return res.status(400).json({ success: false, message: "Invalid item data" });
//             }

//             // 6️⃣ FIND PRODUCT IN SHIPMENT
//             const found = shipment.products.find(p =>
//                 p.productId.toString() === productId &&
//                 (!variant || p.variant?.sku === variant.sku)
//             );

//             if (!found) {
//                 return res.status(400).json({
//                     success: false,
//                     message: "Item does not belong to this shipment"
//                 });
//             }

//             // 7️⃣ QUANTITY ABUSE PROTECTION (IMPORTANT)
//             const alreadyReturnedQty = shipment.returns
//                 ?.filter(r => r.status !== "cancelled")
//                 .flatMap(r => r.items)
//                 .filter(i =>
//                     i.productId.toString() === productId &&
//                     (!variant || i.variant?.sku === variant.sku)
//                 )
//                 .reduce((sum, i) => sum + i.quantity, 0) || 0;

//             if (alreadyReturnedQty + quantity > found.quantity) {
//                 return res.status(400).json({
//                     success: false,
//                     message: "Return quantity exceeds purchased quantity"
//                 });
//             }

//             // 8️⃣ DUPLICATE ACTIVE RETURN CHECK (FIXED)
//             const duplicate = shipment.returns?.some(r =>
//                 r.status !== "cancelled" &&
//                 r.items.some(i =>
//                     i.productId.toString() === productId &&
//                     (!variant || i.variant?.sku === variant.sku)
//                 )
//             );

//             if (duplicate) {
//                 return res.status(400).json({
//                     success: false,
//                     message: "Return already requested for this item"
//                 });
//             }

//             // 9️⃣ IMAGE HANDLING
//             let uploadedImages = [];
//             const fieldKey = `images_${productId}`;

//             if (req.files && req.files[fieldKey]) {
//                 const imgFiles = Array.isArray(req.files[fieldKey])
//                     ? req.files[fieldKey]
//                     : [req.files[fieldKey]];

//                 if (imgFiles.length > MAX_IMAGES_PER_ITEM) {
//                     return res.status(400).json({
//                         success: false,
//                         message: `Maximum ${MAX_IMAGES_PER_ITEM} images allowed per item`
//                     });
//                 }

//                 for (const img of imgFiles) {
//                     const result = await uploadToCloudinary(
//                         img.buffer,
//                         `returns/${shipment_id}/${productId}`
//                     );
//                     uploadedImages.push(result.secure_url ?? result);
//                 }
//             }

//             // 🔟 IMAGE REQUIRED RULE (NYKAA STYLE)
//             const rule = RETURN_REASON_RULES[reason];
//             if (rule?.imagesRequired && uploadedImages.length === 0) {
//                 return res.status(400).json({
//                     success: false,
//                     message: `Images required for reason: ${reason}`
//                 });
//             }

//             validatedItems.push({
//                 _id: new mongoose.Types.ObjectId(),
//                 productId,
//                 quantity,
//                 ...(variant ? { variant } : {}),
//                 reason,
//                 reasonDescription,
//                 images: uploadedImages,
//                 condition: condition || "Unopened"
//             });
//         }

//         // 1️⃣1️⃣ FINAL RETURN ENTRY
//         const returnEntry = {
//             _id: new mongoose.Types.ObjectId(),
//             shipment_id,
//             status: "requested",
//             type, // return | replace

//             items: validatedItems,
//             tracking_history: [],

//             qc: {
//                 status: null,
//                 notes: "",
//                 images: []
//             },

//             refund: {
//                 amount: 0,
//                 status: "pending"
//             },

//             audit_trail: [
//                 {
//                     status: "requested",
//                     action: type === "replace" ? "Replacement Requested" : "Return Requested",
//                     performedBy: userId,
//                     performedByModel: "User",
//                     notes: reasonDescription
//                 }
//             ],

//             requestedBy: userId,
//             requestedAt: new Date(),
//             reason,
//             description: reasonDescription
//         };

//         shipment.returns = shipment.returns || [];
//         shipment.returns.push(returnEntry);

//         // ANALYTICS
//         order.returnStats.totalReturns += 1;
//         if (type === "replace") order.returnStats.totalReplacements += 1;

//         await order.save();

//         return res.status(201).json({
//             success: true,
//             message: type === "replace"
//                 ? "Replacement request submitted"
//                 : "Return request submitted",
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

// // export const approveShipmentReturn = async (req, res) => {
// //     try {
// //         const { shipment_id, returnId } = req.params;

// //         // Find order + shipment + return
// //         const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
// //         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
// //         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

// //         const ret = shipment.returns.id(returnId);
// //         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

// //         // CHECK actual schema field
// //         if (ret.status !== "requested") {
// //             return res.status(400).json({ success: false, message: "Return already processed" });
// //         }

// //         // Create Shiprocket Return Order
// //         let shiprocketResult;
// //         try {
// //             shiprocketResult = await createShiprocketReturnOrder(order, ret);

// //             ret.shiprocket_order_id = shiprocketResult.order_id;
// //             ret.shipment_id = shiprocketResult.shipment_id;

// //             ret.status = "pickup_scheduled";

// //             // Add tracking history (Exists in model)
// //             ret.tracking_history.push({
// //                 status: "pickup_scheduled",
// //                 timestamp: new Date(),
// //                 location: "System",
// //                 description: "Return pickup scheduled by Shiprocket"
// //             });

// //         } catch (err) {
// //             return res.status(422).json({
// //                 success: false,
// //                 message: "Failed to create Shiprocket return order",
// //                 error: err.message
// //             });
// //         }

// //         // Audit trail (Exists in model)
// //         ret.audit_trail.push({
// //             status: "approved",
// //             action: "admin_approved",
// //             performedBy: req.admin?._id,
// //             performedByModel: "Admin",
// //             timestamp: new Date()
// //         });

// //         await order.save();

// //         // Notify user
// //         if (order.user?.email) {
// //             await sendEmail(
// //                 order.user.email,
// //                 "Return Approved",
// //                 `<p>Your return request for Shipment #${shipment.shipment_id} has been approved.</p>`
// //             );
// //         }

// //         return res.json({ success: true, message: "Return approved", shiprocket: shiprocketResult });

// //     } catch (err) {
// //         return res.status(500).json({ success: false, message: err.message });
// //     }
// // };

// export const getAllReturnsForAdmin = async (req, res) => {
//     try {
//         const { status, type, orderId, shipment_id } = req.query;

//         const matchStage = {};

//         if (orderId) matchStage.orderId = orderId;
//         if (shipment_id) matchStage["shipments.shipment_id"] = shipment_id;
//         if (type) matchStage["shipments.returns.type"] = type;
//         if (status) matchStage["shipments.returns.status"] = status;

//         const returns = await Order.aggregate([
//             { $match: matchStage },

//             // Order → Shipments
//             { $unwind: "$shipments" },

//             // Shipments → Returns
//             { $unwind: "$shipments.returns" },

//             // FILTER AFTER UNWIND
//             {
//                 $match: {
//                     ...(status && { "shipments.returns.status": status }),
//                     ...(type && { "shipments.returns.type": type }),
//                     ...(shipment_id && { "shipments.shipment_id": shipment_id })
//                 }
//             },

//             // POPULATE USER
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "user",
//                     foreignField: "_id",
//                     as: "user"
//                 }
//             },
//             { $unwind: "$user" },

//             // FORMAT RESPONSE
//             {
//                 $project: {
//                     // ORDER
//                     orderId: 1,
//                     orderNumber: 1,
//                     orderStatus: 1,
//                     paymentStatus: 1,
//                     createdAt: 1,

//                     user: {
//                         _id: "$user._id",
//                         name: "$user.name",
//                         email: "$user.email",
//                         phone: "$user.phone"
//                     },

//                     // SHIPMENT
//                     shipment: {
//                         shipment_id: "$shipments.shipment_id",
//                         status: "$shipments.status",
//                         deliveredAt: "$shipments.deliveredAt",
//                         awb_code: "$shipments.awb_code",
//                         courier_name: "$shipments.courier_name"
//                     },

//                     // RETURN
//                     return: {
//                         _id: "$shipments.returns._id",
//                         type: "$shipments.returns.type",
//                         status: "$shipments.returns.status",
//                         reason: "$shipments.returns.reason",
//                         description: "$shipments.returns.description",
//                         requestedAt: "$shipments.returns.requestedAt",

//                         items: "$shipments.returns.items",

//                         qc: "$shipments.returns.qc",
//                         refund: "$shipments.returns.refund",
//                         tracking_history: "$shipments.returns.tracking_history",
//                         audit_trail: "$shipments.returns.audit_trail"
//                     }
//                 }
//             },

//             // SORT – newest first
//             { $sort: { "return.requestedAt": -1 } }
//         ]);

//         return res.status(200).json({
//             success: true,
//             total: returns.length,
//             data: returns
//         });

//     } catch (err) {
//         console.error("Admin Return Fetch Error:", err);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to fetch return requests"
//         });
//     }
// };

// export const approveShipmentReturn = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;

//         // 1️⃣ Find order
//         const order = await Order.findOne({
//             "shipments.shipment_id": shipment_id
//         }).populate("user");

//         if (!order) {
//             return res.status(404).json({ success: false, message: "Order / Shipment not found" });
//         }

//         // 2️⃣ Find shipment
//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) {
//             return res.status(404).json({ success: false, message: "Shipment not found" });
//         }

//         // 3️⃣ Find return
//         const ret = shipment.returns.id(returnId);
//         if (!ret) {
//             return res.status(404).json({ success: false, message: "Return not found" });
//         }

//         // 4️⃣ State validation
//         if (ret.status !== "requested") {
//             return res.status(400).json({
//                 success: false,
//                 message: `Return already processed (current: ${ret.status})`
//             });
//         }

//         // 5️⃣ Idempotency safety
//         if (ret.shiprocket_order_id) {
//             return res.json({
//                 success: true,
//                 message: "Return already approved & Shiprocket created",
//                 shiprocket_order_id: ret.shiprocket_order_id
//             });
//         }

//         // 6️⃣ Create Shiprocket return
//         let srData;
//         try {
//             srData = await createShiprocketReturnOrder(order, shipment, ret);
//         } catch (err) {
//             ret.audit_trail.push({
//                 status: "shiprocket_failed",
//                 action: "shiprocket_api_error",
//                 performedBy: req.admin?._id,
//                 performedByModel: "Admin",
//                 timestamp: new Date(),
//                 notes: err.message
//             });

//             await order.save();

//             return res.status(422).json({
//                 success: false,
//                 message: "Shiprocket return creation failed",
//                 error: err.message
//             });
//         }

//         // 7️⃣ Update SAME return (IMPORTANT)
//         ret.shiprocket_order_id = srData.order_id;
//         ret.shipment_id = srData.shipment_id;
//         ret.awb_code = srData.awb_code || null;
//         ret.courier_name = srData.courier_name || null;
//         ret.tracking_url = srData.tracking_url || null;

//         ret.status = "pickup_scheduled";

//         ret.qc = ret.qc || {};
//         ret.qc.status = "pending";

//         ret.tracking_history.push({
//             status: "pickup_scheduled",
//             timestamp: new Date(),
//             location: "System",
//             description: "Return pickup scheduled via Shiprocket"
//         });

//         ret.audit_trail.push({
//             status: "approved",
//             action: "admin_approved",
//             performedBy: req.admin?._id,
//             performedByModel: "Admin",
//             timestamp: new Date(),
//             metadata: { shiprocket: srData }
//         });

//         await order.save();

//         // 8️⃣ Notify user
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 ret.type === "replace" ? "Replacement Approved" : "Return Approved",
//                 `<p>Your ${ret.type} request for Shipment #${shipment.shipment_id} has been approved.</p>`
//             );
//         }

//         return res.json({
//             success: true,
//             message: "Return approved & pickup scheduled",
//             shiprocket: srData
//         });

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

//         if (!reason) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Rejection reason is required"
//             });
//         }

//         // 1️⃣ Find order
//         const order = await Order.findOne({
//             "shipments.shipment_id": shipment_id
//         }).populate("user");

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order / Shipment not found"
//             });
//         }

//         // 2️⃣ Find shipment
//         const shipment = order.shipments.find(
//             s => s.shipment_id === shipment_id
//         );

//         if (!shipment) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Shipment not found"
//             });
//         }

//         // 3️⃣ Find return
//         const ret = shipment.returns.id(returnId);
//         if (!ret) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return not found"
//             });
//         }

//         // 4️⃣ State validation (STRICT)
//         if (ret.status !== "requested") {
//             return res.status(400).json({
//                 success: false,
//                 message: `Return already processed (current: ${ret.status})`
//             });
//         }

//         // 5️⃣ Update return status
//         ret.status = "cancelled";

//         // 6️⃣ Tracking timeline
//         ret.tracking_history.push({
//             status: "cancelled",
//             timestamp: new Date(),
//             location: "Admin",
//             description: reason
//         });

//         // 7️⃣ Audit trail
//         ret.audit_trail.push({
//             status: "cancelled",
//             action: "admin_rejected",
//             notes: reason,
//             performedBy: req.admin?._id,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         // 8️⃣ Notify user
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 "Return Request Rejected",
//                 `
//           <p>Your return request for shipment <b>#${shipment.shipment_id}</b> has been rejected.</p>
//           <p><b>Reason:</b> ${reason}</p>
//         `
//             );
//         }

//         return res.json({
//             success: true,
//             message: "Return rejected successfully"
//         });

//     } catch (err) {
//         console.error("❌ rejectShipmentReturn error:", err);
//         return res.status(500).json({
//             success: false,
//             message: err.message
//         });
//     }
// };

// export const getReturnsSummary = async (req, res) => {
//     try {
//         const {
//             page = 1,
//             limit = 20,
//             status,
//             type,
//             reason,
//             search,
//             sortBy = "requestedAt",
//             sortOrder = "desc"
//         } = req.query;

//         const skip = (page - 1) * limit;
//         const sortDir = sortOrder === "asc" ? 1 : -1;

//         /* ---------------- COMMON MATCH ---------------- */
//         const match = {
//             "shipments.returns": { $exists: true, $ne: [] }
//         };

//         if (status) match["shipments.returns.status"] = status;
//         if (type) match["shipments.returns.type"] = type;
//         if (reason) match["shipments.returns.reason"] = reason;

//         if (search) {
//             match.$or = [
//                 { orderId: { $regex: search, $options: "i" } },
//                 { customOrderId: { $regex: search, $options: "i" } },
//                 { customerName: { $regex: search, $options: "i" } }
//             ];
//         }

//         const pipeline = [
//             { $match: match },
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },

//             {
//                 $project: {
//                     returnId: "$shipments.returns._id",
//                     status: "$shipments.returns.status",
//                     type: "$shipments.returns.type",
//                     reason: "$shipments.returns.reason",
//                     requestedAt: "$shipments.returns.requestedAt",
//                     refundAmount: "$shipments.returns.refund.amount",

//                     orderId: 1,
//                     customOrderId: 1,
//                     customerName: 1,

//                     shipmentId: "$shipments.shipment_id",
//                     awb: "$shipments.awb_code",

//                     totalItems: { $size: "$shipments.returns.items" }
//                 }
//             },

//             {
//                 $facet: {
//                     /* ---------- LIST DATA ---------- */
//                     data: [
//                         { $sort: { [sortBy]: sortDir } },
//                         { $skip: skip },
//                         { $limit: Number(limit) }
//                     ],

//                     /* ---------- COUNT ---------- */
//                     totalCount: [
//                         { $count: "total" }
//                     ],

//                     /* ---------- SUMMARY ---------- */
//                     summary: [
//                         {
//                             $group: {
//                                 _id: null,
//                                 totalReturns: { $sum: 1 },
//                                 totalRefundAmount: { $sum: "$refundAmount" },

//                                 status: { $push: "$status" },
//                                 type: { $push: "$type" },
//                                 reason: { $push: "$reason" }
//                             }
//                         },
//                         {
//                             $project: {
//                                 totalReturns: 1,
//                                 totalRefundAmount: 1,

//                                 statusBreakdown: {
//                                     $arrayToObject: {
//                                         $map: {
//                                             input: { $setUnion: "$status" },
//                                             as: "s",
//                                             in: {
//                                                 k: "$$s",
//                                                 v: {
//                                                     $size: {
//                                                         $filter: {
//                                                             input: "$status",
//                                                             as: "x",
//                                                             cond: { $eq: ["$$x", "$$s"] }
//                                                         }
//                                                     }
//                                                 }
//                                             }
//                                         }
//                                     }
//                                 },

//                                 typeBreakdown: {
//                                     $arrayToObject: {
//                                         $map: {
//                                             input: { $setUnion: "$type" },
//                                             as: "t",
//                                             in: {
//                                                 k: "$$t",
//                                                 v: {
//                                                     $size: {
//                                                         $filter: {
//                                                             input: "$type",
//                                                             as: "x",
//                                                             cond: { $eq: ["$$x", "$$t"] }
//                                                         }
//                                                     }
//                                                 }
//                                             }
//                                         }
//                                     }
//                                 },

//                                 reasonBreakdown: {
//                                     $arrayToObject: {
//                                         $map: {
//                                             input: { $setUnion: "$reason" },
//                                             as: "r",
//                                             in: {
//                                                 k: "$$r",
//                                                 v: {
//                                                     $size: {
//                                                         $filter: {
//                                                             input: "$reason",
//                                                             as: "x",
//                                                             cond: { $eq: ["$$x", "$$r"] }
//                                                         }
//                                                     }
//                                                 }
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     ]
//                 }
//             }
//         ];

//         const [result] = await Order.aggregate(pipeline);

//         const total = result.totalCount[0]?.total || 0;
//         const summary = result.summary[0] || {
//             totalReturns: 0,
//             totalRefundAmount: 0,
//             statusBreakdown: {},
//             typeBreakdown: {},
//             reasonBreakdown: {}
//         };

//         res.json({
//             success: true,
//             data: {
//                 returns: result.data,
//                 pagination: {
//                     page: Number(page),
//                     limit: Number(limit),
//                     total,
//                     totalPages: Math.ceil(total / limit)
//                 },
//                 summary
//             }
//         });

//     } catch (err) {
//         console.error("Returns summary error:", err);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch returns summary"
//         });
//     }
// };

// export const getReturnDetails = async (req, res) => {
//     try {
//         const returnId = new mongoose.Types.ObjectId(req.params.returnId);

//         const pipeline = [
//             { $match: { "shipments.returns._id": returnId } },
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             { $match: { "shipments.returns._id": returnId } },

//             /* ---------- USER ---------- */
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "user",
//                     foreignField: "_id",
//                     as: "user"
//                 }
//             },
//             { $unwind: "$user" },

//             /* ---------- LIVE PRODUCTS (FOR NAME, BRAND, CATEGORY) ---------- */
//             {
//                 $lookup: {
//                     from: "products",
//                     localField: "shipments.returns.items.productId",
//                     foreignField: "_id",
//                     as: "products"
//                 }
//             },

//             /* ---------- BRANDS ---------- */
//             {
//                 $lookup: {
//                     from: "brands",
//                     localField: "products.brand",
//                     foreignField: "_id",
//                     as: "brands"
//                 }
//             },

//             /* ---------- CATEGORIES ---------- */
//             {
//                 $lookup: {
//                     from: "categories",
//                     localField: "products.category",
//                     foreignField: "_id",
//                     as: "categories"
//                 }
//             },

//             /* ---------- QC ADMIN ---------- */
//             {
//                 $lookup: {
//                     from: "admins",
//                     localField: "shipments.returns.qc.checkedBy",
//                     foreignField: "_id",
//                     as: "qcAdmin"
//                 }
//             },
//             { $unwind: { path: "$qcAdmin", preserveNullAndEmptyArrays: true } },

//             /* ---------- FINAL SHAPE ---------- */
//             {
//                 $project: {
//                     /* ---------- RETURN ---------- */
//                     return: {
//                         id: "$shipments.returns._id",
//                         type: "$shipments.returns.type",
//                         status: "$shipments.returns.status",
//                         reason: "$shipments.returns.reason",
//                         description: "$shipments.returns.description",
//                         requestedAt: "$shipments.returns.requestedAt",
//                         trackingTimeline: "$shipments.returns.tracking_history",
//                         auditTrail: "$shipments.returns.audit_trail"
//                     },

//                     /* ---------- ITEMS ---------- */
//                     items: {
//                         $map: {
//                             input: "$shipments.returns.items",
//                             as: "item",
//                             in: {
//                                 productId: "$$item.productId",
//                                 quantity: "$$item.quantity",
//                                 reason: "$$item.reason",
//                                 reasonDescription: "$$item.reasonDescription",
//                                 condition: "$$item.condition",

//                                 /* ✅ USER UPLOADED RETURN PROOF */
//                                 returnImages: "$$item.images",

//                                 product: {
//                                     $let: {
//                                         vars: {
//                                             /* 🔥 ORDER SNAPSHOT PRODUCT */
//                                             orderProduct: {
//                                                 $arrayElemAt: [
//                                                     {
//                                                         $filter: {
//                                                             input: "$products",
//                                                             as: "op",
//                                                             cond: { $eq: ["$$op._id", "$$item.productId"] }
//                                                         }
//                                                     },
//                                                     0
//                                                 ]
//                                             },

//                                             /* LIVE PRODUCT */
//                                             product: {
//                                                 $arrayElemAt: [
//                                                     {
//                                                         $filter: {
//                                                             input: "$products",
//                                                             as: "p",
//                                                             cond: { $eq: ["$$p._id", "$$item.productId"] }
//                                                         }
//                                                     },
//                                                     0
//                                                 ]
//                                             }
//                                         },
//                                         in: {
//                                             _id: "$$product._id",
//                                             name: "$$product.name",

//                                             brand: {
//                                                 $let: {
//                                                     vars: {
//                                                         brand: {
//                                                             $arrayElemAt: [
//                                                                 {
//                                                                     $filter: {
//                                                                         input: "$brands",
//                                                                         as: "b",
//                                                                         cond: { $eq: ["$$b._id", "$$product.brand"] }
//                                                                     }
//                                                                 },
//                                                                 0
//                                                             ]
//                                                         }
//                                                     },
//                                                     in: {
//                                                         _id: "$$brand._id",
//                                                         name: "$$brand.name"
//                                                     }
//                                                 }
//                                             },

//                                             category: {
//                                                 $let: {
//                                                     vars: {
//                                                         category: {
//                                                             $arrayElemAt: [
//                                                                 {
//                                                                     $filter: {
//                                                                         input: "$categories",
//                                                                         as: "c",
//                                                                         cond: { $eq: ["$$c._id", "$$product.category"] }
//                                                                     }
//                                                                 },
//                                                                 0
//                                                             ]
//                                                         }
//                                                     },
//                                                     in: {
//                                                         _id: "$$category._id",
//                                                         name: "$$category.name"
//                                                     }
//                                                 }
//                                             },

//                                             /* 🔥 CORRECT IMAGE FROM ORDER SNAPSHOT */
//                                             image: "$$orderProduct.variant.image",

//                                             /* 🔥 EXACT VARIANT USER BOUGHT */
//                                             variant: "$$orderProduct.variant"
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     },

//                     /* ---------- QC ---------- */
//                     qc: {
//                         status: "$shipments.returns.qc.status",
//                         notes: "$shipments.returns.qc.notes",
//                         images: "$shipments.returns.qc.images",
//                         checkedAt: "$shipments.returns.qc.checkedAt",
//                         checkedBy: {
//                             _id: "$qcAdmin._id",
//                             name: "$qcAdmin.name"
//                         }
//                     },

//                     /* ---------- REFUND ---------- */
//                     refund: {
//                         amount: "$shipments.returns.refund.amount",
//                         status: "$shipments.returns.refund.status",
//                         gatewayRefundId: "$shipments.returns.refund.gatewayRefundId",
//                         refundedAt: "$shipments.returns.refund.refundedAt"
//                     },

//                     /* ---------- SHIPMENT ---------- */
//                     shipment: {
//                         shipmentId: "$shipments.shipment_id",
//                         awb: "$shipments.awb_code",
//                         courier: "$shipments.courier_name",
//                         trackingUrl: "$shipments.tracking_url",
//                         status: "$shipments.status",
//                         trackingTimeline: "$shipments.tracking_history"
//                     },

//                     /* ---------- ORDER ---------- */
//                     order: {
//                         id: "$_id",
//                         orderId: "$orderId",
//                         customOrderId: "$customOrderId",
//                         amount: "$amount",
//                         paymentStatus: "$paymentStatus",
//                         createdAt: "$createdAt"
//                     },

//                     /* ---------- USER ---------- */
//                     user: {
//                         id: "$user._id",
//                         name: "$user.name",
//                         email: "$user.email",
//                         phone: "$user.phone"
//                     }
//                 }
//             }
//         ];

//         const [data] = await Order.aggregate(pipeline);

//         if (!data) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return not found"
//             });
//         }

//         res.json({ success: true, data });

//     } catch (err) {
//         console.error("Return detail error:", err);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch return details"
//         });
//     }
// };

// export const getReturnsAnalytics = async (req, res) => {
//     try {
//         const { period = 'monthly', startDate, endDate } = req.query;
//         const dateFilter = {};
//         if (startDate) dateFilter.$gte = new Date(startDate);
//         if (endDate) dateFilter.$lte = new Date(endDate);

//         // 1. Overall metrics
//         const overallMetrics = await Order.aggregate([
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             ...(Object.keys(dateFilter).length > 0 ? [
//                 { $match: { "shipments.returns.requestedAt": dateFilter } }
//             ] : []),
//             {
//                 $group: {
//                     _id: null,
//                     totalReturns: { $sum: 1 },
//                     totalRefundAmount: { $sum: "$shipments.returns.refund.amount" },
//                     totalReplacements: {
//                         $sum: { $cond: [{ $eq: ["$shipments.returns.type", "replace"] }, 1, 0] }
//                     },
//                     averageProcessingTime: {
//                         $avg: {
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
//                                         1000 * 60 * 60 // Hours
//                                     ]
//                                 },
//                                 else: null
//                             }
//                         }
//                     }
//                 }
//             }
//         ]);

//         // 2. Time-based trends
//         const groupByFormat = period === 'daily' ? '%Y-%m-%d' :
//             period === 'weekly' ? '%Y-%U' :
//                 period === 'monthly' ? '%Y-%m' :
//                     '%Y-%m-%d';

//         const trendMetrics = await Order.aggregate([
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             ...(Object.keys(dateFilter).length > 0 ? [
//                 { $match: { "shipments.returns.requestedAt": dateFilter } }
//             ] : []),
//             {
//                 $group: {
//                     _id: {
//                         $dateToString: {
//                             format: groupByFormat,
//                             date: "$shipments.returns.requestedAt"
//                         }
//                     },
//                     returns: { $sum: 1 },
//                     replacements: {
//                         $sum: { $cond: [{ $eq: ["$shipments.returns.type", "replace"] }, 1, 0] }
//                     },
//                     refundAmount: { $sum: "$shipments.returns.refund.amount" },
//                     averageValue: { $avg: "$shipments.returns.refund.amount" }
//                 }
//             },
//             { $sort: { _id: 1 } }
//         ]);

//         // 3. Status distribution
//         const statusDistribution = await Order.aggregate([
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             ...(Object.keys(dateFilter).length > 0 ? [
//                 { $match: { "shipments.returns.requestedAt": dateFilter } }
//             ] : []),
//             {
//                 $group: {
//                     _id: "$shipments.returns.status",
//                     count: { $sum: 1 },
//                     averageRefund: { $avg: "$shipments.returns.refund.amount" }
//                 }
//             },
//             { $sort: { count: -1 } }
//         ]);

//         // 4. Reason distribution
//         const reasonDistribution = await Order.aggregate([
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             ...(Object.keys(dateFilter).length > 0 ? [
//                 { $match: { "shipments.returns.requestedAt": dateFilter } }
//             ] : []),
//             {
//                 $group: {
//                     _id: "$shipments.returns.reason",
//                     count: { $sum: 1 },
//                     percentage: { $avg: 1 }
//                 }
//             },
//             { $sort: { count: -1 } }
//         ]);

//         const productReturns = await Order.aggregate([
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             { $unwind: "$shipments.returns.items" },

//             ...(Object.keys(dateFilter).length > 0 ? [{
//                 $match: { "shipments.returns.requestedAt": dateFilter }
//             }] : []),

//             {
//                 $lookup: {
//                     from: "products",
//                     localField: "shipments.returns.items.productId",
//                     foreignField: "_id",
//                     as: "product"
//                 }
//             },
//             { $unwind: "$product" },

//             // 1️⃣ GROUP BY PRODUCT + REASON
//             {
//                 $group: {
//                     _id: {
//                         productId: "$product._id",
//                         reason: "$shipments.returns.items.reason"
//                     },
//                     productName: { $first: "$product.name" },
//                     category: { $first: "$product.category" },
//                     count: { $sum: 1 },
//                     quantity: { $sum: "$shipments.returns.items.quantity" }
//                 }
//             },

//             // 2️⃣ SORT REASONS BY COUNT
//             { $sort: { count: -1 } },

//             // 3️⃣ GROUP BACK TO PRODUCT
//             {
//                 $group: {
//                     _id: "$_id.productId",
//                     productName: { $first: "$productName" },
//                     category: { $first: "$category" },
//                     returnCount: { $sum: "$count" },
//                     totalQuantity: { $sum: "$quantity" },
//                     topReason: {
//                         $first: {
//                             reason: "$_id.reason",
//                             count: "$count"
//                         }
//                     }
//                 }
//             },

//             // 4️⃣ SORT PRODUCTS BY RETURNS
//             { $sort: { returnCount: -1 } },
//             { $limit: 10 }
//         ]);


//         // 6. User-wise return patterns
//         const userPatterns = await Order.aggregate([
//             { $unwind: "$shipments" },
//             { $unwind: "$shipments.returns" },
//             ...(Object.keys(dateFilter).length > 0 ? [
//                 { $match: { "shipments.returns.requestedAt": dateFilter } }
//             ] : []),
//             {
//                 $group: {
//                     _id: "$user",
//                     returnCount: { $sum: 1 },
//                     totalRefundAmount: { $sum: "$shipments.returns.refund.amount" },
//                     averageRefund: { $avg: "$shipments.returns.refund.amount" },
//                     replacementCount: {
//                         $sum: { $cond: [{ $eq: ["$shipments.returns.type", "replace"] }, 1, 0] }
//                     }
//                 }
//             },
//             { $sort: { returnCount: -1 } },
//             { $limit: 10 },
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "_id",
//                     foreignField: "_id",
//                     as: "userDetails"
//                 }
//             },
//             { $unwind: "$userDetails" },
//             {
//                 $project: {
//                     userId: "$_id",
//                     userName: "$userDetails.name",
//                     userEmail: "$userDetails.email",
//                     returnCount: 1,
//                     totalRefundAmount: 1,
//                     averageRefund: 1,
//                     replacementCount: 1
//                 }
//             }
//         ]);

//         return res.json({
//             success: true,
//             data: {
//                 overallMetrics: overallMetrics[0] || {
//                     totalReturns: 0,
//                     totalRefundAmount: 0,
//                     totalReplacements: 0,
//                     averageProcessingTime: 0
//                 },
//                 trends: trendMetrics,
//                 statusDistribution,
//                 reasonDistribution,
//                 topReturningProducts: productReturns,
//                 topReturningUsers: userPatterns,
//                 timePeriod: period,
//                 dateRange: {
//                     start: startDate,
//                     end: endDate
//                 }
//             }
//         });

//     } catch (error) {
//         console.error("Admin returns analytics error:", error);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to fetch analytics",
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };

