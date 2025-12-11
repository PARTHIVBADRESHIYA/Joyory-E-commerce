// // // controllers/returnController.js
// // import mongoose from 'mongoose';
// // import Order from '../models/Order.js';
// // import Product from '../models/Product.js';
// // import User from '../models/User.js';
// // import { sendEmail } from '../middlewares/utils/emailService.js';
// // import { returnRequestSchema } from '../middlewares/validations/returnValidator.js';
// // import { uploadToCloudinary } from '../middlewares/upload.js';

// // // Calculate return window (7 days from delivery)
// // const calculateReturnWindow = (deliveryDate) => {
// //     const returnBy = new Date(deliveryDate);
// //     returnBy.setDate(returnBy.getDate() + 7);
// //     return returnBy;
// // };

// // // Check if product is returnable
// // const isProductReturnable = (product, orderDate) => {
// //     // Check category-specific policies
// //     const nonReturnableCategories = ['Personal Care', 'Innerwear', 'Earrings'];
// //     const isCategoryReturnable = !nonReturnableCategories.includes(product.category);

// //     // Check if within return window
// //     const today = new Date();
// //     const maxReturnDate = new Date(orderDate);
// //     maxReturnDate.setDate(maxReturnDate.getDate() + (product.returnPolicy?.days || 7));

// //     return isCategoryReturnable && today <= maxReturnDate;
// // };

// // // ==================== USER ENDPOINTS ====================

// // // 1. Request Return/Replace
// // export const requestReturn = async (req, res) => {
// //     const session = await mongoose.startSession();

// //     try {
// //         session.startTransaction();

// //         const { orderId, returnType, items, reason, description } = req.body;
// //         const userId = req.user?._id;

// //         // Basic validation
// //         if (!orderId || !returnType || !items || !reason) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "Missing required fields: orderId, returnType, items, reason"
// //             });
// //         }

// //         // Find order
// //         const order = await Order.findById(orderId)
// //             .populate('user')
// //             .populate('products.productId')
// //             .session(session);

// //         if (!order) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Order not found"
// //             });
// //         }

// //         // Verify ownership
// //         if (String(order.user._id) !== String(userId)) {
// //             return res.status(403).json({
// //                 success: false,
// //                 message: "Unauthorized - This order doesn't belong to you"
// //             });
// //         }

// //         // Check if order is delivered
// //         if (order.orderStatus !== "Delivered") {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "Return can only be requested for delivered orders"
// //             });
// //         }

// //         // Check return window (7 days from delivery)
// //         const deliveredDate = order.updatedAt; // You might want to add a deliveredAt field
// //         const returnByDate = calculateReturnWindow(deliveredDate);
// //         const today = new Date();

// //         if (today > returnByDate) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "Return window (7 days) has expired"
// //             });
// //         }

// //         // Check if return already exists
// //         const existingReturn = order.returns.find(
// //             r => !["rejected", "cancelled", "completed"].includes(r.overallStatus)
// //         );

// //         if (existingReturn) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "An active return request already exists for this order"
// //             });
// //         }

// //         // Upload images if any
// //         let uploadedImages = [];
// //         if (req.files?.images) {
// //             const imageFiles = Array.isArray(req.files.images)
// //                 ? req.files.images
// //                 : [req.files.images];

// //             for (const file of imageFiles) {
// //                 const result = await uploadToCloudinary(file.tempFilePath, 'returns');
// //                 uploadedImages.push(result.secure_url);
// //             }
// //         }

// //         // Validate each return item
// //         const returnItems = [];
// //         let totalRefundAmount = 0;

// //         for (const item of items) {
// //             const orderProduct = order.products.find(
// //                 p => String(p.productId._id) === String(item.productId)
// //             );

// //             if (!orderProduct) {
// //                 throw new Error(`Product ${item.productId} not found in order`);
// //             }

// //             // Check if already returned
// //             const alreadyReturnedQty = order.returns.reduce((total, ret) => {
// //                 const retItem = ret.items.find(i => String(i.productId) === String(item.productId));
// //                 return total + (retItem?.quantity || 0);
// //             }, 0);

// //             const availableQty = orderProduct.quantity - alreadyReturnedQty;

// //             if (item.quantity > availableQty) {
// //                 throw new Error(`Cannot return ${item.quantity} items of ${orderProduct.productId.name}. Only ${availableQty} available for return.`);
// //             }

// //             // Check product return policy
// //             const product = await Product.findById(item.productId).session(session);
// //             if (!product.returnable) {
// //                 throw new Error(`Product ${product.name} is not returnable`);
// //             }

// //             // Calculate refund amount based on condition
// //             let refundPercentage = 100; // Default for unopened
// //             if (item.condition === "Opened - Unused") refundPercentage = 80;
// //             if (item.condition === "Used") refundPercentage = 0; // No refund for used items
// //             if (item.condition === "Damaged") refundPercentage = 0;

// //             const itemPrice = orderProduct.variant?.discountedPrice || orderProduct.price;
// //             const refundAmount = (itemPrice * item.quantity * refundPercentage) / 100;

// //             returnItems.push({
// //                 productId: item.productId,
// //                 quantity: item.quantity,
// //                 variant: orderProduct.variant,
// //                 reason: item.reason,
// //                 reasonDescription: item.description,
// //                 images: uploadedImages,
// //                 condition: item.condition,
// //                 status: "requested",
// //                 refundAmount,
// //                 pickupAddress: order.shippingAddress,
// //             });

// //             totalRefundAmount += refundAmount;
// //         }

// //         // Create return request
// //         const returnRequest = {
// //             returnType,
// //             items: returnItems,
// //             overallStatus: "requested",
// //             reason,
// //             description,
// //             requestedBy: userId,
// //             requestedAt: new Date(),
// //             policyApplied: "7_day_return",
// //             returnWindowValid: true,
// //             returnByDate,
// //             refund: {
// //                 amount: totalRefundAmount,
// //                 method: returnType === "return" ? "original" : null,
// //                 status: "pending"
// //             },
// //             auditTrail: [{
// //                 status: "requested",
// //                 action: "return_requested",
// //                 performedBy: userId,
// //                 performedByModel: "User",
// //                 notes: "Return request submitted by user",
// //                 metadata: { returnType, reason }
// //             }]
// //         };

// //         // Add return to order
// //         order.returns.push(returnRequest);
// //         order.markModified('returns');
// //         await order.save({ session });

// //         // Send notification emails
// //         try {
// //             // To user
// //             await sendEmail(
// //                 order.user.email,
// //                 "Return Request Received - Joyory",
// //                 `
// //                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
// //                   <h2 style="color: #333;">Return Request Received</h2>
// //                   <p>Dear ${order.user.name},</p>
// //                   <p>We have received your ${returnType} request for Order #${order.orderNumber}.</p>

// //                   <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
// //                     <h3 style="margin-top: 0;">Request Details:</h3>
// //                     <p><strong>Type:</strong> ${returnType}</p>
// //                     <p><strong>Reason:</strong> ${reason}</p>
// //                     <p><strong>Total Items:</strong> ${items.length}</p>
// //                     <p><strong>Estimated Refund:</strong> ₹${totalRefundAmount}</p>
// //                   </div>

// //                   <p>Our team will review your request within 24-48 hours. You'll receive an update once it's processed.</p>

// //                   <p>You can track your return request in your Joyory account.</p>

// //                   <p>Best regards,<br>
// //                   Team Joyory</p>
// //                 </div>
// //                 `
// //             );

// //             // To admin
// //             await sendEmail(
// //                 process.env.ADMIN_EMAIL,
// //                 "🔄 New Return Request - Requires Attention",
// //                 `
// //                 <div style="font-family: Arial, sans-serif;">
// //                   <h2>New Return Request</h2>
// //                   <p><strong>Order ID:</strong> ${order._id}</p>
// //                   <p><strong>Order Number:</strong> ${order.orderNumber}</p>
// //                   <p><strong>Customer:</strong> ${order.user.name} (${order.user.email})</p>
// //                   <p><strong>Request Type:</strong> ${returnType}</p>
// //                   <p><strong>Reason:</strong> ${reason}</p>
// //                   <p><strong>Total Amount:</strong> ₹${totalRefundAmount}</p>
// //                   <p><strong>Items:</strong> ${items.length} item(s)</p>

// //                   <hr>
// //                   <p>Please review this request in the admin panel.</p>
// //                 </div>
// //                 `
// //             );
// //         } catch (emailError) {
// //             console.error("Email sending failed:", emailError.message);
// //         }

// //         await session.commitTransaction();

// //         res.status(200).json({
// //             success: true,
// //             message: "Return request submitted successfully",
// //             data: {
// //                 returnId: returnRequest._id,
// //                 estimatedRefund: totalRefundAmount,
// //                 nextSteps: "Our team will review your request within 24-48 hours",
// //                 returnByDate,
// //             }
// //         });

// //     } catch (error) {
// //         await session.abortTransaction();
// //         console.error("Return request error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: error.message || "Failed to process return request"
// //         });
// //     } finally {
// //         await session.endSession();
// //     }
// // };

// // // 2. Get Return Status
// // export const getReturnStatus = async (req, res) => {
// //     try {
// //         const { orderId } = req.params;
// //         const userId = req.user?._id;

// //         const order = await Order.findById(orderId)
// //             .populate('user')
// //             .populate('returns.requestedBy')
// //             .populate('returns.items.productId')
// //             .populate('returns.approvedBy')
// //             .populate('returns.rejectedBy')
// //             .populate('returns.replacement.orderId');

// //         if (!order) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Order not found"
// //             });
// //         }

// //         // Verify ownership
// //         if (String(order.user._id) !== String(userId)) {
// //             return res.status(403).json({
// //                 success: false,
// //                 message: "Unauthorized"
// //             });
// //         }

// //         // Check return eligibility if no returns yet
// //         let returnEligibility = null;
// //         if (order.returns.length === 0 && order.orderStatus === "Delivered") {
// //             const deliveredDate = order.updatedAt;
// //             const returnByDate = calculateReturnWindow(deliveredDate);
// //             const today = new Date();
// //             const daysLeft = Math.ceil((returnByDate - today) / (1000 * 60 * 60 * 24));

// //             returnEligibility = {
// //                 eligible: daysLeft > 0,
// //                 daysLeft: daysLeft > 0 ? daysLeft : 0,
// //                 returnByDate,
// //                 conditions: [
// //                     "Product must be in original condition",
// //                     "Original packaging required",
// //                     "Invoice must be included"
// //                 ]
// //             };
// //         }

// //         res.status(200).json({
// //             success: true,
// //             data: {
// //                 orderId: order._id,
// //                 orderNumber: order.orderNumber,
// //                 orderStatus: order.orderStatus,
// //                 returns: order.returns,
// //                 returnEligibility,
// //                 canRequestReturn: order.returns.length === 0 && order.orderStatus === "Delivered" && returnEligibility?.eligible
// //             }
// //         });

// //     } catch (error) {
// //         console.error("Get return status error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: "Failed to fetch return status"
// //         });
// //     }
// // };

// // // 3. Cancel Return Request
// // export const cancelReturn = async (req, res) => {
// //     const session = await mongoose.startSession();

// //     try {
// //         session.startTransaction();

// //         const { returnId } = req.params;
// //         const userId = req.user?._id;
// //         const { reason } = req.body;

// //         // Find order containing this return
// //         const order = await Order.findOne({ "returns._id": returnId })
// //             .populate('user')
// //             .session(session);

// //         if (!order) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Return request not found"
// //             });
// //         }

// //         // Verify ownership
// //         if (String(order.user._id) !== String(userId)) {
// //             return res.status(403).json({
// //                 success: false,
// //                 message: "Unauthorized"
// //             });
// //         }

// //         const returnRequest = order.returns.id(returnId);
// //         if (!returnRequest) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Return request not found"
// //             });
// //         }

// //         // Check if return can be cancelled
// //         const cancellableStatuses = ["requested", "pending_approval", "approved"];
// //         if (!cancellableStatuses.includes(returnRequest.overallStatus)) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: `Return cannot be cancelled in current status: ${returnRequest.overallStatus}`
// //             });
// //         }

// //         // Update return status
// //         returnRequest.overallStatus = "cancelled";
// //         returnRequest.auditTrail.push({
// //             status: "cancelled",
// //             action: "return_cancelled",
// //             performedBy: userId,
// //             performedByModel: "User",
// //             notes: reason || "Return cancelled by user",
// //             timestamp: new Date()
// //         });

// //         // Update item statuses
// //         returnRequest.items.forEach(item => {
// //             item.status = "cancelled";
// //         });

// //         await order.save({ session });

// //         // Send notification email
// //         try {
// //             await sendEmail(
// //                 order.user.email,
// //                 "Return Request Cancelled - Joyory",
// //                 `
// //                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
// //                   <h2 style="color: #333;">Return Request Cancelled</h2>
// //                   <p>Dear ${order.user.name},</p>
// //                   <p>Your return request for Order #${order.orderNumber} has been cancelled.</p>

// //                   <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
// //                     <p><strong>Cancellation Reason:</strong> ${reason || "Not specified"}</p>
// //                     <p><strong>Cancelled On:</strong> ${new Date().toLocaleDateString()}</p>
// //                   </div>

// //                   <p>If this was a mistake or you need further assistance, please contact our support team.</p>

// //                   <p>Best regards,<br>
// //                   Team Joyory</p>
// //                 </div>
// //                 `
// //             );
// //         } catch (emailError) {
// //             console.error("Email sending failed:", emailError.message);
// //         }

// //         await session.commitTransaction();

// //         res.status(200).json({
// //             success: true,
// //             message: "Return request cancelled successfully"
// //         });

// //     } catch (error) {
// //         await session.abortTransaction();
// //         console.error("Cancel return error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: error.message || "Failed to cancel return request"
// //         });
// //     } finally {
// //         await session.endSession();
// //     }
// // };

// // // ==================== ADMIN ENDPOINTS ====================

// // // 4. Review Return Request (Approve/Reject)
// // export const reviewReturnRequest = async (req, res) => {
// //     const session = await mongoose.startSession();

// //     try {
// //         session.startTransaction();

// //         const { returnId } = req.params;
// //         const { orderId, action, adminNotes, rejectionReason, schedulePickup } = req.body;
// //         const adminId = req.admin?._id || req.user?._id; // Assuming admin middleware sets req.user

// //         if (!["approve", "reject", "request_more_info"].includes(action)) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "Invalid action. Must be 'approve', 'reject', or 'request_more_info'"
// //             });
// //         }

// //         const order = await Order.findById(orderId)
// //             .populate('user')
// //             .session(session);

// //         if (!order) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Order not found"
// //             });
// //         }

// //         const returnRequest = order.returns.id(returnId);
// //         if (!returnRequest) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Return request not found"
// //             });
// //         }

// //         // Update return status based on action
// //         if (action === "approve") {
// //             returnRequest.overallStatus = "approved";
// //             returnRequest.approvedBy = adminId;
// //             returnRequest.approvedAt = new Date();

// //             // Schedule pickup if applicable
// //             if (schedulePickup) {
// //                 returnRequest.overallStatus = "pickup_scheduled";
// //                 returnRequest.pickupDetails = {
// //                     scheduledDate: schedulePickup.date,
// //                     courier: schedulePickup.courier,
// //                     pickupAddress: schedulePickup.address || order.shippingAddress,
// //                     timeSlot: schedulePickup.timeSlot || "9 AM - 6 PM"
// //                 };
// //             }

// //             returnRequest.auditTrail.push({
// //                 status: returnRequest.overallStatus,
// //                 action: "return_approved",
// //                 performedBy: adminId,
// //                 performedByModel: "Admin",
// //                 notes: adminNotes || "Return approved by admin",
// //                 metadata: { schedulePickup }
// //             });

// //         } else if (action === "reject") {
// //             returnRequest.overallStatus = "rejected";
// //             returnRequest.rejectedBy = adminId;
// //             returnRequest.rejectedAt = new Date();
// //             returnRequest.rejectionReason = rejectionReason;

// //             // Update each item status
// //             returnRequest.items.forEach(item => {
// //                 item.status = "rejected";
// //             });

// //             returnRequest.auditTrail.push({
// //                 status: "rejected",
// //                 action: "return_rejected",
// //                 performedBy: adminId,
// //                 performedByModel: "Admin",
// //                 notes: rejectionReason,
// //                 metadata: { adminNotes }
// //             });
// //         } else if (action === "request_more_info") {
// //             returnRequest.overallStatus = "pending_approval";
// //             returnRequest.auditTrail.push({
// //                 status: "pending_approval",
// //                 action: "more_info_requested",
// //                 performedBy: adminId,
// //                 performedByModel: "Admin",
// //                 notes: adminNotes || "More information requested from user",
// //                 metadata: { requestedInfo: adminNotes }
// //             });
// //         }

// //         await order.save({ session });

// //         // Send notification to user
// //         try {
// //             await sendEmail(
// //                 order.user.email,
// //                 action === "approve"
// //                     ? "✅ Your Return Request Has Been Approved - Joyory"
// //                     : action === "reject"
// //                         ? "❌ Return Request Update - Joyory"
// //                         : "📝 More Information Needed for Your Return - Joyory",
// //                 `
// //                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
// //                   <h2 style="color: #333;">Return Request ${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Update'}</h2>
// //                   <p>Dear ${order.user.name},</p>

// //                   <div style="background: ${action === 'approve' ? '#d4edda' : action === 'reject' ? '#f8d7da' : '#fff3cd'}; 
// //                              color: ${action === 'approve' ? '#155724' : action === 'reject' ? '#721c24' : '#856404'};
// //                              padding: 15px; border-radius: 5px; margin: 20px 0;">
// //                     <p><strong>Status:</strong> ${action === 'approve' ? '✅ Approved' : action === 'reject' ? '❌ Rejected' : '🔄 More Info Needed'}</p>
// //                     <p><strong>Order:</strong> #${order.orderNumber}</p>
// //                     ${action === 'approve'
// //                     ? `<p><strong>Next Step:</strong> Pickup will be scheduled as per your convenience</p>`
// //                     : action === 'reject'
// //                         ? `<p><strong>Reason:</strong> ${rejectionReason}</p>`
// //                         : `<p><strong>Information Requested:</strong> ${adminNotes}</p>`
// //                 }
// //                     ${adminNotes && action !== 'reject' ? `<p><strong>Admin Notes:</strong> ${adminNotes}</p>` : ''}
// //                   </div>

// //                   <p>You can view the details in your Joyory account.</p>

// //                   <p>Best regards,<br>
// //                   Team Joyory</p>
// //                 </div>
// //                 `
// //             );
// //         } catch (emailError) {
// //             console.error("Email sending failed:", emailError.message);
// //         }

// //         await session.commitTransaction();

// //         res.status(200).json({
// //             success: true,
// //             message: `Return request ${action}ed successfully`,
// //             data: {
// //                 status: returnRequest.overallStatus,
// //                 nextSteps: action === 'approve'
// //                     ? "Pickup will be scheduled"
// //                     : action === 'reject'
// //                         ? "Request has been rejected"
// //                         : "Waiting for user response"
// //             }
// //         });

// //     } catch (error) {
// //         await session.abortTransaction();
// //         console.error("Review return error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: error.message || "Failed to process review"
// //         });
// //     } finally {
// //         await session.endSession();
// //     }
// // };

// // // 5. Schedule Pickup
// // export const schedulePickup = async (req, res) => {
// //     const session = await mongoose.startSession();

// //     try {
// //         session.startTransaction();

// //         const { orderId, returnId, courier, scheduledDate, timeSlot, pickupAddress } = req.body;
// //         const adminId = req.admin?._id || req.user?._id;

// //         const order = await Order.findById(orderId)
// //             .populate('user')
// //             .session(session);

// //         if (!order) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Order not found"
// //             });
// //         }

// //         const returnRequest = order.returns.id(returnId);
// //         if (!returnRequest) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Return request not found"
// //             });
// //         }

// //         // Check if return is approved
// //         if (returnRequest.overallStatus !== "approved") {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "Return must be approved before scheduling pickup"
// //             });
// //         }

// //         // Generate AWB (mock - integrate with actual courier API)
// //         const awb = `AWB${Date.now()}${Math.floor(Math.random() * 1000)}`;
// //         const trackingUrl = `https://track.courier.com/${awb}`;

// //         // Update pickup details
// //         returnRequest.pickupDetails = {
// //             awb,
// //             courier,
// //             trackingUrl,
// //             scheduledDate: new Date(scheduledDate),
// //             timeSlot: timeSlot || "9 AM - 6 PM",
// //             pickupAddress: pickupAddress || order.shippingAddress,
// //             scheduledBy: adminId,
// //             scheduledAt: new Date()
// //         };

// //         returnRequest.overallStatus = "pickup_scheduled";

// //         returnRequest.auditTrail.push({
// //             status: "pickup_scheduled",
// //             action: "pickup_scheduled",
// //             performedBy: adminId,
// //             performedByModel: "Admin",
// //             notes: `Pickup scheduled with ${courier} for ${new Date(scheduledDate).toLocaleDateString()}`,
// //             metadata: { courier, scheduledDate, awb }
// //         });

// //         await order.save({ session });

// //         // Send notification to user
// //         try {
// //             await sendEmail(
// //                 order.user.email,
// //                 "📦 Pickup Scheduled for Your Return - Joyory",
// //                 `
// //                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
// //                   <h2 style="color: #333;">Pickup Scheduled</h2>
// //                   <p>Dear ${order.user.name},</p>
// //                   <p>Pickup has been scheduled for your return request for Order #${order.orderNumber}.</p>

// //                   <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
// //                     <h3 style="margin-top: 0;">Pickup Details:</h3>
// //                     <p><strong>Courier:</strong> ${courier}</p>
// //                     <p><strong>Scheduled Date:</strong> ${new Date(scheduledDate).toLocaleDateString()}</p>
// //                     <p><strong>Time Slot:</strong> ${timeSlot || "9 AM - 6 PM"}</p>
// //                     <p><strong>AWB Number:</strong> ${awb}</p>
// //                     <p><strong>Tracking:</strong> <a href="${trackingUrl}">Track Shipment</a></p>
// //                   </div>

// //                   <p><strong>Please ensure:</strong></p>
// //                   <ul>
// //                     <li>Products are in original packaging</li>
// //                     <li>Invoice is included</li>
// //                     <li>All accessories and free gifts are returned</li>
// //                     <li>Pack the items securely</li>
// //                   </ul>

// //                   <p>Best regards,<br>
// //                   Team Joyory</p>
// //                 </div>
// //                 `
// //             );
// //         } catch (emailError) {
// //             console.error("Email sending failed:", emailError.message);
// //         }

// //         await session.commitTransaction();

// //         res.status(200).json({
// //             success: true,
// //             message: "Pickup scheduled successfully",
// //             data: {
// //                 awb,
// //                 trackingUrl,
// //                 scheduledDate,
// //                 courier,
// //                 nextSteps: "User will be notified and courier will pick up the package"
// //             }
// //         });

// //     } catch (error) {
// //         await session.abortTransaction();
// //         console.error("Schedule pickup error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: error.message || "Failed to schedule pickup"
// //         });
// //     } finally {
// //         await session.endSession();
// //     }
// // };

// // // 6. Update Pickup Status
// // export const updatePickupStatus = async (req, res) => {
// //     const session = await mongoose.startSession();

// //     try {
// //         session.startTransaction();

// //         const { orderId, returnId, status, location, description } = req.body;
// //         const adminId = req.admin?._id || req.user?._id;

// //         const order = await Order.findById(orderId)
// //             .populate('user')
// //             .session(session);

// //         if (!order) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Order not found"
// //             });
// //         }

// //         const returnRequest = order.returns.id(returnId);
// //         if (!returnRequest) {
// //             return res.status(404).json({
// //                 success: false,
// //                 message: "Return request not found"
// //             });
// //         }

// //         // Define status flow
// //         const statusFlow = {
// //             "pickup_scheduled": ["picked_up"],
// //             "picked_up": ["in_transit", "failed"],
// //             "in_transit": ["received_at_warehouse", "delayed"],
// //             "received_at_warehouse": ["quality_check"]
// //         };

// //         // Validate status transition
// //         const allowedNextStatuses = statusFlow[returnRequest.overallStatus] || [];
// //         if (!allowedNextStatuses.includes(status)) {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: `Cannot transition from ${returnRequest.overallStatus} to ${status}`
// //             });
// //         }

// //         // Update status
// //         returnRequest.overallStatus = status;

// //         if (status === "picked_up") {
// //             returnRequest.pickupDetails.pickedUpAt = new Date();
// //         } else if (status === "received_at_warehouse") {
// //             returnRequest.receivedAt = new Date();
// //         }

// //         // Add to audit trail
// //         returnRequest.auditTrail.push({
// //             status: status,
// //             action: "status_updated",
// //             performedBy: adminId,
// //             performedByModel: "Admin",
// //             notes: description || `Status updated to ${status}`,
// //             metadata: { location, description }
// //         });

// //         // Add tracking history if pickup details exist
// //         if (returnRequest.pickupDetails) {
// //             returnRequest.pickupDetails.trackingHistory = returnRequest.pickupDetails.trackingHistory || [];
// //             returnRequest.pickupDetails.trackingHistory.push({
// //                 status,
// //                 location,
// //                 description,
// //                 timestamp: new Date()
// //             });
// //         }

// //         await order.save({ session });

// //         // Send notification for major status updates
// //         const notifyStatuses = ["picked_up", "received_at_warehouse", "failed"];
// //         if (notifyStatuses.includes(status)) {
// //             try {
// //                 await sendEmail(
// //                     order.user.email,
// //                     `Return Status Updated: ${status} - Joyory`,
// //                     `
// //                     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
// //                       <h2 style="color: #333;">Return Status Update</h2>
// //                       <p>Dear ${order.user.name},</p>
// //                       <p>The status of your return for Order #${order.orderNumber} has been updated.</p>

// //                       <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
// //                         <h3 style="margin-top: 0;">Update Details:</h3>
// //                         <p><strong>New Status:</strong> ${status.replace(/_/g, ' ').toUpperCase()}</p>
// //                         <p><strong>Location:</strong> ${location || 'Not specified'}</p>
// //                         <p><strong>Description:</strong> ${description || 'No additional details'}</p>
// //                         ${returnRequest.pickupDetails?.awb ? `<p><strong>AWB:</strong> ${returnRequest.pickupDetails.awb}</p>` : ''}
// //                       </div>

// //                       <p>You can track your return in your Joyory account.</p>

// //                       <p>Best regards,<br>
// //                       Team Joyory</p>
// //                     </div>
// //                     `
// //                 );
// //             } catch (emailError) {
// //                 console.error("Email sending failed:", emailError.message);
// //             }
// //         }

// //         await session.commitTransaction();

// //         res.status(200).json({
// //             success: true,
// //             message: "Pickup status updated successfully",
// //             data: {
// //                 status,
// //                 updatedAt: new Date()
// //             }
// //         });

// //     } catch (error) {
// //         await session.abortTransaction();
// //         console.error("Update pickup status error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: error.message || "Failed to update pickup status"
// //         });
// //     } finally {
// //         await session.endSession();
// //     }
// // };

// // // 7. Process Return After Receiving at Warehouse
// // export const processReturn = async (req, res) => {
// //     const session = await mongoose.startSession();

// //     try {
// //         session.startTransaction();

// //         const { orderId, returnId, qualityCheck, refundMethod } = req.body;
// //         const adminId = req.admin?._id || req.user?._id;

// //         const order = await Order.findById(orderId)
// //             .populate('user')
// //             .session(session);

// //         const returnRequest = order.returns.id(returnId);

// //         if (!returnRequest || returnRequest.overallStatus !== "received_at_warehouse") {
// //             return res.status(400).json({
// //                 success: false,
// //                 message: "Return not ready for processing or not found"
// //             });
// //         }

// //         // Perform quality check
// //         returnRequest.qualityCheck = {
// //             checkedBy: adminId,
// //             checkedAt: new Date(),
// //             condition: qualityCheck.condition,
// //             notes: qualityCheck.notes,
// //             images: qualityCheck.images || [],
// //         };

// //         // Determine refund based on quality
// //         let finalRefundAmount = 0;
// //         let shouldRefund = true;
// //         let rejectedItems = [];

// //         for (const item of returnRequest.items) {
// //             const quality = qualityCheck.items?.find(q => String(q.productId) === String(item.productId));

// //             if (quality) {
// //                 if (quality.status === "acceptable") {
// //                     // Full or partial refund based on condition
// //                     const conditionMultiplier = {
// //                         "excellent": 1.0,
// //                         "good": 0.8,
// //                         "fair": 0.5,
// //                         "poor": 0
// //                     };

// //                     const multiplier = conditionMultiplier[quality.condition] || 0;
// //                     const itemRefund = item.refundAmount * multiplier;
// //                     finalRefundAmount += itemRefund;

// //                     item.status = "approved_for_refund";
// //                     item.refundAmount = itemRefund;

// //                     // Restock if product is in good condition
// //                     if (quality.condition !== "poor") {
// //                         await restockProduct(item.productId, item.quantity, item.variant?.sku, session);
// //                     }
// //                 } else {
// //                     item.status = "rejected";
// //                     rejectedItems.push({
// //                         productId: item.productId,
// //                         reason: quality.reason || "Quality check failed"
// //                     });
// //                     shouldRefund = false;
// //                 }
// //             }
// //         }

// //         if (shouldRefund && finalRefundAmount > 0) {
// //             // Update return status
// //             returnRequest.overallStatus = "approved_for_refund";
// //             returnRequest.refund.amount = finalRefundAmount;
// //             returnRequest.refund.method = refundMethod;

// //             // Initiate refund based on method
// //             if (refundMethod === "original") {
// //                 // Process Razorpay refund
// //                 await processRazorpayRefund(order, finalRefundAmount, session);
// //             } else if (refundMethod === "wallet") {
// //                 // Credit to user's wallet
// //                 await creditToWallet(order.user, finalRefundAmount, "return_refund", session);
// //             }

// //             returnRequest.refund.status = "initiated";
// //             returnRequest.auditTrail.push({
// //                 status: "refund_initiated",
// //                 action: "refund_processed",
// //                 performedBy: adminId,
// //                 performedByModel: "Admin",
// //                 notes: `Refund of ₹${finalRefundAmount} initiated via ${refundMethod}`,
// //                 metadata: { refundMethod, amount: finalRefundAmount }
// //             });

// //             // Send refund initiated email
// //             await sendEmail(
// //                 order.user.email,
// //                 "💰 Refund Initiated for Your Return - Joyory",
// //                 `
// //                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
// //                   <h2 style="color: #333;">Refund Initiated</h2>
// //                   <p>Dear ${order.user.name},</p>
// //                   <p>We have processed your return for Order #${order.orderNumber} and initiated your refund.</p>

// //                   <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
// //                     <h3 style="margin-top: 0;">Refund Details:</h3>
// //                     <p><strong>Amount:</strong> ₹${finalRefundAmount}</p>
// //                     <p><strong>Method:</strong> ${refundMethod === 'original' ? 'Original Payment Method' : refundMethod === 'wallet' ? 'Joyory Wallet' : refundMethod}</p>
// //                     <p><strong>Status:</strong> Initiated</p>
// //                     <p><strong>Estimated Time:</strong> ${refundMethod === 'original' ? '5-7 business days' : 'Instant'}</p>
// //                   </div>

// //                   <p>You will receive a confirmation once the refund is completed.</p>

// //                   <p>Thank you for shopping with Joyory!</p>

// //                   <p>Best regards,<br>
// //                   Team Joyory</p>
// //                 </div>
// //                 `
// //             );
// //         } else {
// //             returnRequest.overallStatus = "rejected";
// //             returnRequest.refund.status = "failed";
// //             returnRequest.auditTrail.push({
// //                 status: "rejected",
// //                 action: "quality_check_failed",
// //                 performedBy: adminId,
// //                 performedByModel: "Admin",
// //                 notes: "Items failed quality check",
// //                 metadata: { qualityCheck, rejectedItems }
// //             });

// //             // Send rejection email
// //             await sendEmail(
// //                 order.user.email,
// //                 "⚠️ Return Processing Update - Joyory",
// //                 `
// //                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
// //                   <h2 style="color: #333;">Return Request Rejected</h2>
// //                   <p>Dear ${order.user.name},</p>
// //                   <p>We have processed your return for Order #${order.orderNumber} but unfortunately, it did not pass our quality check.</p>

// //                   <div style="background: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0;">
// //                     <h3 style="margin-top: 0;">Rejection Details:</h3>
// //                     <p><strong>Reason:</strong> Products did not meet quality standards</p>
// //                     ${rejectedItems.length > 0 ? `<p><strong>Rejected Items:</strong> ${rejectedItems.map(item => item.productId).join(', ')}</p>` : ''}
// //                     <p><strong>Admin Notes:</strong> ${qualityCheck.notes || 'Please refer to our return policy for acceptable conditions'}</p>
// //                   </div>

// //                   <p>If you have any questions, please contact our support team.</p>

// //                   <p>Best regards,<br>
// //                   Team Joyory</p>
// //                 </div>
// //                 `
// //             );
// //         }

// //         await order.save({ session });
// //         await session.commitTransaction();

// //         res.status(200).json({
// //             success: true,
// //             message: shouldRefund
// //                 ? `Refund of ₹${finalRefundAmount} initiated successfully`
// //                 : "Return rejected due to quality issues",
// //             data: {
// //                 refundAmount: finalRefundAmount,
// //                 refundMethod,
// //                 estimatedTime: refundMethod === "original" ? "5-7 business days" : "Instant",
// //                 rejectedItems
// //             }
// //         });

// //     } catch (error) {
// //         await session.abortTransaction();
// //         console.error("Process return error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: error.message || "Failed to process return"
// //         });
// //     } finally {
// //         await session.endSession();
// //     }
// // };

// // // 8. Get All Returns (Admin)
// // export const getAllReturns = async (req, res) => {
// //     try {
// //         const {
// //             page = 1,
// //             limit = 20,
// //             status,
// //             returnType,
// //             startDate,
// //             endDate,
// //             search
// //         } = req.query;

// //         // Build query
// //         let query = {};

// //         if (status) {
// //             query["returns.overallStatus"] = status;
// //         }

// //         if (returnType) {
// //             query["returns.returnType"] = returnType;
// //         }

// //         if (startDate || endDate) {
// //             query["returns.requestedAt"] = {};
// //             if (startDate) query["returns.requestedAt"].$gte = new Date(startDate);
// //             if (endDate) query["returns.requestedAt"].$lte = new Date(endDate);
// //         }

// //         if (search) {
// //             query.$or = [
// //                 { orderNumber: { $regex: search, $options: 'i' } },
// //                 { "user.name": { $regex: search, $options: 'i' } },
// //                 { "user.email": { $regex: search, $options: 'i' } }
// //             ];
// //         }

// //         // Get orders with returns
// //         const orders = await Order.find(query)
// //             .populate('user', 'name email phone')
// //             .populate('returns.requestedBy', 'name email')
// //             .populate('returns.approvedBy', 'name email')
// //             .populate('returns.items.productId', 'name sku images')
// //             .sort({ "returns.requestedAt": -1 })
// //             .skip((page - 1) * limit)
// //             .limit(parseInt(limit));

// //         // Extract and flatten returns
// //         const allReturns = [];
// //         orders.forEach(order => {
// //             order.returns.forEach(ret => {
// //                 allReturns.push({
// //                     orderId: order._id,
// //                     orderNumber: order.orderNumber,
// //                     customer: order.user,
// //                     returnId: ret._id,
// //                     returnType: ret.returnType,
// //                     status: ret.overallStatus,
// //                     requestedAt: ret.requestedAt,
// //                     items: ret.items,
// //                     refundAmount: ret.refund?.amount,
// //                     approvedBy: ret.approvedBy,
// //                     approvedAt: ret.approvedAt,
// //                     pickupScheduled: ret.pickupDetails?.scheduledDate
// //                 });
// //             });
// //         });

// //         // Get total count
// //         const total = await Order.countDocuments(query);

// //         // Statistics
// //         const stats = {
// //             totalReturns: total,
// //             pending: await Order.countDocuments({ "returns.overallStatus": { $in: ["requested", "pending_approval"] } }),
// //             approved: await Order.countDocuments({ "returns.overallStatus": "approved" }),
// //             inProgress: await Order.countDocuments({ "returns.overallStatus": { $in: ["pickup_scheduled", "picked_up", "in_transit"] } }),
// //             completed: await Order.countDocuments({ "returns.overallStatus": { $in: ["refunded", "replacement_delivered"] } }),
// //             rejected: await Order.countDocuments({ "returns.overallStatus": "rejected" })
// //         };

// //         res.status(200).json({
// //             success: true,
// //             data: {
// //                 returns: allReturns,
// //                 pagination: {
// //                     page: parseInt(page),
// //                     limit: parseInt(limit),
// //                     total,
// //                     pages: Math.ceil(total / limit)
// //                 },
// //                 stats
// //             }
// //         });

// //     } catch (error) {
// //         console.error("Get all returns error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: "Failed to fetch returns"
// //         });
// //     }
// // };

// // // ==================== PUBLIC ENDPOINTS ====================

// // // 9. Get Return Policy
// // export const getReturnPolicy = async (req, res) => {
// //     try {
// //         const returnPolicy = {
// //             summary: "7 Days Return & Exchange Policy",
// //             returnWindow: "7 days from delivery date",
// //             conditions: [
// //                 "Products must be in original condition",
// //                 "Original packaging must be intact",
// //                 "Invoice must be included",
// //                 "All tags and labels must be attached",
// //                 "Free gifts must be returned if applicable"
// //             ],
// //             nonReturnable: [
// //                 "Personal care items (for hygiene reasons)",
// //                 "Innerwear & hosiery",
// //                 "Earrings",
// //                 "Customized or personalized products",
// //                 "Gift cards & vouchers",
// //                 "Products marked as 'Non-Returnable'"
// //             ],
// //             refundMethods: [
// //                 { method: "original", description: "Refund to original payment method", timeline: "5-7 business days" },
// //                 { method: "wallet", description: "Joyory Wallet credit", timeline: "Instant" },
// //                 { method: "voucher", description: "Store credit voucher", timeline: "Instant" }
// //             ],
// //             exchangePolicy: {
// //                 allowed: true,
// //                 conditions: [
// //                     "Exchange for different size/shade only",
// //                     "Product must be unused",
// //                     "Original packaging required",
// //                     "Exchange shipping charges may apply"
// //                 ]
// //             },
// //             qualityCheck: "All returns undergo quality check at our warehouse",
// //             contactSupport: "For any return-related queries, contact support@joyory.com"
// //         };

// //         res.status(200).json({
// //             success: true,
// //             data: returnPolicy
// //         });

// //     } catch (error) {
// //         console.error("Get return policy error:", error);
// //         res.status(500).json({
// //             success: false,
// //             message: "Failed to fetch return policy"
// //         });
// //     }
// // };

// // // ==================== HELPER FUNCTIONS ====================

// // // Restock product after return
// // const restockProduct = async (productId, quantity, sku, session) => {
// //     const product = await Product.findById(productId).session(session);

// //     if (sku && product.variants?.length > 0) {
// //         // Restock variant
// //         const variant = product.variants.find(v => v.sku === sku);
// //         if (variant) {
// //             variant.stock += quantity;
// //             variant.sales = Math.max(0, (variant.sales || 0) - quantity);
// //         }
// //     } else {
// //         // Restock main product
// //         product.quantity += quantity;
// //     }

// //     product.sales = Math.max(0, (product.sales || 0) - quantity);

// //     // Update product status
// //     if (product.quantity <= 0) {
// //         product.status = "Out of stock";
// //     } else if (product.thresholdValue && product.quantity < product.thresholdValue) {
// //         product.status = "Low stock";
// //     } else {
// //         product.status = "In-stock";
// //     }

// //     await product.save({ session });
// // };

// // // Process Razorpay Refund (Mock implementation - integrate with actual Razorpay)
// // const processRazorpayRefund = async (order, amount, session) => {
// //     console.log(`Processing Razorpay refund for order ${order._id}: ₹${amount}`);

// //     // In real implementation:
// //     // 1. Call Razorpay refund API
// //     // 2. Update order with refund ID
// //     // 3. Handle refund status

// //     return { success: true, refundId: `rfnd_${Date.now()}` };
// // };

// // // Credit to Wallet (Mock implementation)
// // const creditToWallet = async (userId, amount, reason, session) => {
// //     console.log(`Crediting ₹${amount} to user ${userId} wallet for ${reason}`);

// //     // In real implementation:
// //     // 1. Find user wallet
// //     // 2. Add credit
// //     // 3. Create transaction record

// //     return { success: true, transactionId: `wallet_${Date.now()}` };
// // };









































// // controllers/returnController.js
// import mongoose from 'mongoose';
// import { Queue } from 'bullmq';
// import Order from '../models/Order.js';
// import Product from '../models/Product.js';
// import User from '../models/User.js';
// import Wallet from '../models/Wallet.js'; // Assuming you have a Wallet model
// import { sendEmail } from '../middlewares/utils/emailService.js';
// import { returnRequestSchema } from '../middlewares/validations/returnValidator.js';
// import { uploadToCloudinary } from '../middlewares/upload.js';
// import { createRedisConnection } from '../middlewares/services/redisConnection.js';
// import {
//     createShiprocketOrder,
//     cancelShiprocketShipment,
//     getShiprocketToken,
//     validatePincodeServiceability
// } from '../middlewares/services/shiprocket.js';

// // Initialize refund queue
// const refundQueue = new Queue('refundQueue', {
//     connection: createRedisConnection(true)
// });

// // Calculate return window (7 days from delivery)
// const calculateReturnWindow = (deliveryDate) => {
//     const returnBy = new Date(deliveryDate);
//     returnBy.setDate(returnBy.getDate() + 7);
//     return returnBy;
// };

// // ==================== HELPER FUNCTIONS ====================

// // Restock product after return
// const restockProduct = async (productId, quantity, sku, session) => {
//     const product = await Product.findById(productId).session(session);

//     if (sku && product.variants?.length > 0) {
//         const variant = product.variants.find(v => v.sku === sku);
//         if (variant) {
//             variant.stock += quantity;
//             variant.sales = Math.max(0, (variant.sales || 0) - quantity);
//         }
//     } else {
//         product.quantity += quantity;
//     }

//     product.sales = Math.max(0, (product.sales || 0) - quantity);

//     if (product.quantity <= 0) {
//         product.status = "Out of stock";
//     } else if (product.thresholdValue && product.quantity < product.thresholdValue) {
//         product.status = "Low stock";
//     } else {
//         product.status = "In-stock";
//     }

//     await product.save({ session });
// };

// // Create Shiprocket return order
// const createShiprocketReturnOrder = async (order, returnRequest, pickupAddress) => {
//     try {
//         const token = await getShiprocketToken();

//         // Prepare return order items
//         const order_items = returnRequest.items.map(item => ({
//             name: item.productId?.name || "Return Product",
//             sku: item.variant?.sku || `RTN-${item.productId}`,
//             units: item.quantity,
//             selling_price: item.refundAmount / item.quantity || 0
//         }));

//         // Use warehouse address as delivery address (where returns go)
//         const warehousePincode = process.env.SHIPROCKET_PICKUP_PIN || "110030";
//         const warehouseState = process.env.SHIPROCKET_WAREHOUSE_STATE || "Delhi";
//         const warehouseCity = process.env.SHIPROCKET_WAREHOUSE_CITY || "Delhi";
//         const warehouseAddress = process.env.SHIPROCKET_WAREHOUSE_ADDRESS || "Warehouse Address";

//         const returnOrderData = {
//             order_id: `RETURN-${order.orderNumber}-${Date.now()}`,
//             order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
//             // Pickup from customer
//             pickup_location: "Customer Location",
//             billing_customer_name: order.shippingAddress?.name || order.customerName || "Customer",
//             billing_last_name: "",
//             billing_address: pickupAddress?.address || order.shippingAddress?.address || "",
//             billing_city: pickupAddress?.city || order.shippingAddress?.city || "",
//             billing_pincode: pickupAddress?.pincode || order.shippingAddress?.pincode || "",
//             billing_state: pickupAddress?.state || order.shippingAddress?.state || "",
//             billing_country: "India",
//             billing_email: order.user?.email || "guest@example.com",
//             billing_phone: pickupAddress?.phone || order.shippingAddress?.phone || "0000000000",
//             // Delivery to warehouse (this is the destination for returns)
//             shipping_customer_name: process.env.SHIPROCKET_WAREHOUSE_NAME || "Joyory Warehouse",
//             shipping_last_name: "",
//             shipping_address: warehouseAddress,
//             shipping_city: warehouseCity,
//             shipping_pincode: warehousePincode,
//             shipping_state: warehouseState,
//             shipping_country: "India",
//             shipping_email: process.env.WAREHOUSE_EMAIL || "warehouse@joyory.com",
//             shipping_phone: process.env.WAREHOUSE_PHONE || "0000000000",
//             shipping_is_billing: false,
//             order_items,
//             payment_method: "Prepaid", // Returns are usually prepaid
//             sub_total: returnRequest.refund.amount || 0,
//             length: 10,
//             breadth: 10,
//             height: 10,
//             weight: Math.max(0.1, returnRequest.items.reduce((sum, item) => sum + item.quantity, 0) * 0.2),
//             is_return: 1 // This marks it as a return order in Shiprocket
//         };

//         const response = await axios({
//             url: "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
//             method: "POST",
//             data: returnOrderData,
//             headers: { Authorization: `Bearer ${token}` }
//         });

//         if (!response.data?.id) {
//             throw new Error("No Shiprocket order ID returned");
//         }

//         return {
//             shiprocket_order_id: response.data.id,
//             shipment_id: response.data.shipment_id,
//             awb_code: response.data.awb_code,
//             courier_name: response.data.courier_name,
//             tracking_url: response.data.tracking_url
//         };

//     } catch (error) {
//         console.error("Shiprocket return order creation failed:", error.response?.data || error.message);
//         throw new Error(`Shiprocket API Error: ${error.message}`);
//     }
// };

// // Process Razorpay refund through queue
// const processRazorpayRefund = async (order, amount, returnId, session) => {
//     try {
//         // Add refund job to queue
//         await refundQueue.add('process-refund', {
//             orderId: order._id,
//             returnId,
//             amount,
//             refundType: 'return'
//         });

//         // Update order with refund initiation
//         order.refund = {
//             amount,
//             method: "razorpay",
//             status: "initiated",
//             requestedAt: new Date(),
//             requestedBy: order.user,
//             reason: "Return Refund"
//         };

//         await order.save({ session });
//         return { success: true, message: "Refund queued for processing" };
//     } catch (error) {
//         console.error("Error queuing refund:", error);
//         throw new Error("Failed to initiate refund");
//     }
// };

// // Credit to user's wallet
// const creditToWallet = async (userId, amount, reason, session) => {
//     const user = await User.findById(userId).session(session);

//     // Find or create wallet
//     let wallet = await Wallet.findOne({ user: userId }).session(session);
//     if (!wallet) {
//         wallet = new Wallet({
//             user: userId,
//             balance: 0,
//             transactions: []
//         });
//     }

//     // Add credit
//     wallet.balance += amount;
//     wallet.transactions.push({
//         type: 'credit',
//         amount,
//         reason,
//         reference: `RETURN-${Date.now()}`,
//         balanceAfter: wallet.balance
//     });

//     await wallet.save({ session });

//     // Update user's wallet balance
//     user.walletBalance = wallet.balance;
//     await user.save({ session });

//     return { success: true, newBalance: wallet.balance };
// };

// // Validate pickup pincode serviceability
// const validatePickupServiceability = async (pincode) => {
//     try {
//         const serviceability = await validatePincodeServiceability(pincode, false); // COD false for returns
//         return {
//             serviceable: serviceability.serviceable,
//             couriers: serviceability.couriers
//         };
//     } catch (error) {
//         console.error("Serviceability check failed:", error);
//         return { serviceable: true, couriers: [] }; // Default to true if check fails
//     }
// };

// // ==================== USER ENDPOINTS ====================

// // 1. Request Return/Replace
// export const requestReturn = async (req, res) => {
//     const session = await mongoose.startSession();

//     try {
//         session.startTransaction();

//         const { orderId, returnType, items, reason, description } = req.body;
//         const userId = req.user?._id;

//         // Basic validation
//         if (!orderId || !returnType || !items || !reason) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Missing required fields: orderId, returnType, items, reason"
//             });
//         }

//         // Find order
//         const order = await Order.findById(orderId)
//             .populate('user')
//             .populate('products.productId')
//             .session(session);

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         // Verify ownership
//         if (String(order.user._id) !== String(userId)) {
//             return res.status(403).json({
//                 success: false,
//                 message: "Unauthorized - This order doesn't belong to you"
//             });
//         }

//         // Check if order is delivered
//         if (order.orderStatus !== "Delivered") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Return can only be requested for delivered orders"
//             });
//         }

//         // Check return window (7 days from delivery)
//         const deliveredDate = order.updatedAt; // You might want to add a deliveredAt field
//         const returnByDate = calculateReturnWindow(deliveredDate);
//         const today = new Date();

//         if (today > returnByDate) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Return window (7 days) has expired"
//             });
//         }

//         // Check if return already exists
//         const existingReturn = order.returns.find(
//             r => !["rejected", "cancelled", "completed"].includes(r.overallStatus)
//         );

//         if (existingReturn) {
//             return res.status(400).json({
//                 success: false,
//                 message: "An active return request already exists for this order"
//             });
//         }

//         // Upload images if any
//         let uploadedImages = [];
//         if (req.files?.images) {
//             const imageFiles = Array.isArray(req.files.images)
//                 ? req.files.images
//                 : [req.files.images];

//             for (const file of imageFiles) {
//                 const result = await uploadToCloudinary(file.tempFilePath, 'returns');
//                 uploadedImages.push(result.secure_url);
//             }
//         }

//         // Validate each return item
//         const returnItems = [];
//         let totalRefundAmount = 0;

//         for (const item of items) {
//             const orderProduct = order.products.find(
//                 p => String(p.productId._id) === String(item.productId)
//             );

//             if (!orderProduct) {
//                 throw new Error(`Product ${item.productId} not found in order`);
//             }

//             // Check if already returned
//             const alreadyReturnedQty = order.returns.reduce((total, ret) => {
//                 const retItem = ret.items.find(i => String(i.productId) === String(item.productId));
//                 return total + (retItem?.quantity || 0);
//             }, 0);

//             const availableQty = orderProduct.quantity - alreadyReturnedQty;

//             if (item.quantity > availableQty) {
//                 throw new Error(`Cannot return ${item.quantity} items of ${orderProduct.productId.name}. Only ${availableQty} available for return.`);
//             }

//           // Calculate refund amount based on condition
//             let refundPercentage = 100; // Default for unopened
//             if (item.condition === "Opened - Unused") refundPercentage = 80;
//             if (item.condition === "Used") refundPercentage = 0; // No refund for used items
//             if (item.condition === "Damaged") refundPercentage = 0;

//             const itemPrice = orderProduct.variant?.discountedPrice || orderProduct.price;
//             const refundAmount = (itemPrice * item.quantity * refundPercentage) / 100;

//             returnItems.push({
//                 productId: item.productId,
//                 quantity: item.quantity,
//                 variant: orderProduct.variant,
//                 reason: item.reason,
//                 reasonDescription: item.description,
//                 images: uploadedImages,
//                 condition: item.condition,
//                 status: "requested",
//                 refundAmount,
//                 pickupAddress: order.shippingAddress,
//             });

//             totalRefundAmount += refundAmount;
//         }

//         // Create return request
//         const returnRequest = {
//             returnType,
//             items: returnItems,
//             overallStatus: "requested",
//             reason,
//             description,
//             requestedBy: userId,
//             requestedAt: new Date(),
//             policyApplied: "7_day_return",
//             returnWindowValid: true,
//             returnByDate,
//             refund: {
//                 amount: totalRefundAmount,
//                 method: returnType === "return" ? "original" : null,
//                 status: "pending"
//             },
//             auditTrail: [{
//                 status: "requested",
//                 action: "return_requested",
//                 performedBy: userId,
//                 performedByModel: "User",
//                 notes: "Return request submitted by user",
//                 metadata: { returnType, reason }
//             }]
//         };

//         // Add return to order
//         order.returns.push(returnRequest);
//         order.markModified('returns');
//         await order.save({ session });

//         // Send notification emails
//         try {
//             // To user
//             await sendEmail(
//                 order.user.email,
//                 "Return Request Received - Joyory",
//                 `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                   <h2 style="color: #333;">Return Request Received</h2>
//                   <p>Dear ${order.user.name},</p>
//                   <p>We have received your ${returnType} request for Order #${order.orderNumber}.</p>

//                   <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                     <h3 style="margin-top: 0;">Request Details:</h3>
//                     <p><strong>Type:</strong> ${returnType}</p>
//                     <p><strong>Reason:</strong> ${reason}</p>
//                     <p><strong>Total Items:</strong> ${items.length}</p>
//                     <p><strong>Estimated Refund:</strong> ₹${totalRefundAmount}</p>
//                   </div>

//                   <p>Our team will review your request within 24-48 hours. You'll receive an update once it's processed.</p>

//                   <p>You can track your return request in your Joyory account.</p>

//                   <p>Best regards,<br>
//                   Team Joyory</p>
//                 </div>
//                 `
//             );

//             // To admin
//             await sendEmail(
//                 process.env.ADMIN_EMAIL,
//                 "🔄 New Return Request - Requires Attention",
//                 `
//                 <div style="font-family: Arial, sans-serif;">
//                   <h2>New Return Request</h2>
//                   <p><strong>Order ID:</strong> ${order._id}</p>
//                   <p><strong>Order Number:</strong> ${order.orderNumber}</p>
//                   <p><strong>Customer:</strong> ${order.user.name} (${order.user.email})</p>
//                   <p><strong>Request Type:</strong> ${returnType}</p>
//                   <p><strong>Reason:</strong> ${reason}</p>
//                   <p><strong>Total Amount:</strong> ₹${totalRefundAmount}</p>
//                   <p><strong>Items:</strong> ${items.length} item(s)</p>

//                   <hr>
//                   <p>Please review this request in the admin panel.</p>
//                 </div>
//                 `
//             );
//         } catch (emailError) {
//             console.error("Email sending failed:", emailError.message);
//         }

//         await session.commitTransaction();

//         res.status(200).json({
//             success: true,
//             message: "Return request submitted successfully",
//             data: {
//                 returnId: returnRequest._id,
//                 estimatedRefund: totalRefundAmount,
//                 nextSteps: "Our team will review your request within 24-48 hours",
//                 returnByDate,
//             }
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Return request error:", error);
//         res.status(500).json({
//             success: false,
//             message: error.message || "Failed to process return request"
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// // 2. Get Return Status
// export const getReturnStatus = async (req, res) => {
//     try {
//         const { orderId } = req.params;
//         const userId = req.user?._id;

//         const order = await Order.findById(orderId)
//             .populate('user')
//             .populate('returns.requestedBy')
//             .populate('returns.items.productId')
//             .populate('returns.approvedBy')
//             .populate('returns.rejectedBy')
//             .populate('returns.replacement.orderId');

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         // Verify ownership
//         if (String(order.user._id) !== String(userId)) {
//             return res.status(403).json({
//                 success: false,
//                 message: "Unauthorized"
//             });
//         }

//         // Check return eligibility if no returns yet
//         let returnEligibility = null;
//         if (order.returns.length === 0 && order.orderStatus === "Delivered") {
//             const deliveredDate = order.updatedAt;
//             const returnByDate = calculateReturnWindow(deliveredDate);
//             const today = new Date();
//             const daysLeft = Math.ceil((returnByDate - today) / (1000 * 60 * 60 * 24));

//             returnEligibility = {
//                 eligible: daysLeft > 0,
//                 daysLeft: daysLeft > 0 ? daysLeft : 0,
//                 returnByDate,
//                 conditions: [
//                     "Product must be in original condition",
//                     "Original packaging required",
//                     "Invoice must be included"
//                 ]
//             };
//         }

//         res.status(200).json({
//             success: true,
//             data: {
//                 orderId: order._id,
//                 orderNumber: order.orderNumber,
//                 orderStatus: order.orderStatus,
//                 returns: order.returns,
//                 returnEligibility,
//                 canRequestReturn: order.returns.length === 0 && order.orderStatus === "Delivered" && returnEligibility?.eligible
//             }
//         });

//     } catch (error) {
//         console.error("Get return status error:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch return status"
//         });
//     }
// };

// // 3. Cancel Return Request
// export const cancelReturn = async (req, res) => {
//     const session = await mongoose.startSession();

//     try {
//         session.startTransaction();

//         const { returnId } = req.params;
//         const userId = req.user?._id;
//         const { reason } = req.body;

//         // Find order containing this return
//         const order = await Order.findOne({ "returns._id": returnId })
//             .populate('user')
//             .session(session);

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return request not found"
//             });
//         }

//         // Verify ownership
//         if (String(order.user._id) !== String(userId)) {
//             return res.status(403).json({
//                 success: false,
//                 message: "Unauthorized"
//             });
//         }

//         const returnRequest = order.returns.id(returnId);
//         if (!returnRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return request not found"
//             });
//         }

//         // Check if return can be cancelled
//         const cancellableStatuses = ["requested", "pending_approval", "approved"];
//         if (!cancellableStatuses.includes(returnRequest.overallStatus)) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Return cannot be cancelled in current status: ${returnRequest.overallStatus}`
//             });
//         }

//         // Cancel Shiprocket shipment if exists
//         if (returnRequest.pickupDetails?.shiprocket_order_id) {
//             try {
//                 await cancelShiprocketShipment(returnRequest.pickupDetails.shiprocket_order_id);
//                 returnRequest.pickupDetails.cancelledAt = new Date();
//                 returnRequest.auditTrail.push({
//                     status: "cancelled",
//                     action: "shiprocket_cancelled",
//                     performedBy: userId,
//                     performedByModel: "User",
//                     notes: "Shiprocket pickup cancelled",
//                     timestamp: new Date()
//                 });
//             } catch (shiprocketError) {
//                 console.warn("Shiprocket cancellation failed:", shiprocketError.message);
//                 // Continue with cancellation even if Shiprocket fails
//             }
//         }

//         // Update return status
//         returnRequest.overallStatus = "cancelled";
//         returnRequest.auditTrail.push({
//             status: "cancelled",
//             action: "return_cancelled",
//             performedBy: userId,
//             performedByModel: "User",
//             notes: reason || "Return cancelled by user",
//             timestamp: new Date()
//         });

//         // Update item statuses
//         returnRequest.items.forEach(item => {
//             item.status = "cancelled";
//         });

//         await order.save({ session });

//         // Send notification email
//         try {
//             await sendEmail(
//                 order.user.email,
//                 "Return Request Cancelled - Joyory",
//                 `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                   <h2 style="color: #333;">Return Request Cancelled</h2>
//                   <p>Dear ${order.user.name},</p>
//                   <p>Your return request for Order #${order.orderNumber} has been cancelled.</p>

//                   <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                     <p><strong>Cancellation Reason:</strong> ${reason || "Not specified"}</p>
//                     <p><strong>Cancelled On:</strong> ${new Date().toLocaleDateString()}</p>
//                   </div>

//                   <p>If this was a mistake or you need further assistance, please contact our support team.</p>

//                   <p>Best regards,<br>
//                   Team Joyory</p>
//                 </div>
//                 `
//             );
//         } catch (emailError) {
//             console.error("Email sending failed:", emailError.message);
//         }

//         await session.commitTransaction();

//         res.status(200).json({
//             success: true,
//             message: "Return request cancelled successfully"
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Cancel return error:", error);
//         res.status(500).json({
//             success: false,
//             message: error.message || "Failed to cancel return request"
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// // ==================== ADMIN ENDPOINTS ====================

// // 4. Review Return Request (Approve/Reject)
// export const reviewReturnRequest = async (req, res) => {
//     const session = await mongoose.startSession();

//     try {
//         session.startTransaction();

//         const { returnId } = req.params;
//         const { orderId, action, adminNotes, rejectionReason, schedulePickup } = req.body;
//         const adminId = req.user?._id; // Admin middleware should set req.user

//         if (!["approve", "reject", "request_more_info"].includes(action)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid action. Must be 'approve', 'reject', or 'request_more_info'"
//             });
//         }

//         const order = await Order.findById(orderId)
//             .populate('user')
//             .session(session);

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         const returnRequest = order.returns.id(returnId);
//         if (!returnRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return request not found"
//             });
//         }

//         // Update return status based on action
//         if (action === "approve") {
//             returnRequest.overallStatus = "approved";
//             returnRequest.approvedBy = adminId;
//             returnRequest.approvedAt = new Date();

//             // Schedule pickup if applicable
//             if (schedulePickup) {
//                 try {
//                     // Validate pickup address serviceability
//                     const pickupAddress = schedulePickup.address || order.shippingAddress;
//                     const serviceability = await validatePickupServiceability(pickupAddress.pincode);

//                     if (!serviceability.serviceable) {
//                         throw new Error("Pickup location is not serviceable by our courier partners");
//                     }

//                     // Create Shiprocket return order
//                     const shiprocketResult = await createShiprocketReturnOrder(
//                         order,
//                         returnRequest,
//                         pickupAddress
//                     );

//                     returnRequest.overallStatus = "pickup_scheduled";
//                     returnRequest.pickupDetails = {
//                         scheduledDate: schedulePickup.date,
//                         timeSlot: schedulePickup.timeSlot || "9 AM - 6 PM",
//                         pickupAddress: pickupAddress,
//                         shiprocket_order_id: shiprocketResult.shiprocket_order_id,
//                         shipment_id: shiprocketResult.shipment_id,
//                         awb: shiprocketResult.awb_code,
//                         courier: shiprocketResult.courier_name,
//                         trackingUrl: shiprocketResult.tracking_url,
//                         scheduledBy: adminId,
//                         scheduledAt: new Date()
//                     };

//                     returnRequest.auditTrail.push({
//                         status: "pickup_scheduled",
//                         action: "pickup_scheduled",
//                         performedBy: adminId,
//                         performedByModel: "Admin",
//                         notes: `Pickup scheduled with ${shiprocketResult.courier_name}. AWB: ${shiprocketResult.awb_code}`,
//                         metadata: { shiprocketResult }
//                     });

//                 } catch (shiprocketError) {
//                     console.error("Shiprocket scheduling failed:", shiprocketError.message);
//                     throw new Error(`Failed to schedule pickup: ${shiprocketError.message}`);
//                 }
//             } else {
//                 returnRequest.auditTrail.push({
//                     status: "approved",
//                     action: "return_approved",
//                     performedBy: adminId,
//                     performedByModel: "Admin",
//                     notes: adminNotes || "Return approved by admin",
//                     metadata: { schedulePickup }
//                 });
//             }

//         } else if (action === "reject") {
//             returnRequest.overallStatus = "rejected";
//             returnRequest.rejectedBy = adminId;
//             returnRequest.rejectedAt = new Date();
//             returnRequest.rejectionReason = rejectionReason;

//             // Update each item status
//             returnRequest.items.forEach(item => {
//                 item.status = "rejected";
//             });

//             returnRequest.auditTrail.push({
//                 status: "rejected",
//                 action: "return_rejected",
//                 performedBy: adminId,
//                 performedByModel: "Admin",
//                 notes: rejectionReason,
//                 metadata: { adminNotes }
//             });
//         } else if (action === "request_more_info") {
//             returnRequest.overallStatus = "pending_approval";
//             returnRequest.auditTrail.push({
//                 status: "pending_approval",
//                 action: "more_info_requested",
//                 performedBy: adminId,
//                 performedByModel: "Admin",
//                 notes: adminNotes || "More information requested from user",
//                 metadata: { requestedInfo: adminNotes }
//             });
//         }

//         await order.save({ session });

//         // Send notification to user
//         try {
//             await sendEmail(
//                 order.user.email,
//                 action === "approve"
//                     ? "✅ Your Return Request Has Been Approved - Joyory"
//                     : action === "reject"
//                         ? "❌ Return Request Update - Joyory"
//                         : "📝 More Information Needed for Your Return - Joyory",
//                 `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                   <h2 style="color: #333;">Return Request ${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Update'}</h2>
//                   <p>Dear ${order.user.name},</p>

//                   <div style="background: ${action === 'approve' ? '#d4edda' : action === 'reject' ? '#f8d7da' : '#fff3cd'}; 
//                              color: ${action === 'approve' ? '#155724' : action === 'reject' ? '#721c24' : '#856404'};
//                              padding: 15px; border-radius: 5px; margin: 20px 0;">
//                     <p><strong>Status:</strong> ${action === 'approve' ? '✅ Approved' : action === 'reject' ? '❌ Rejected' : '🔄 More Info Needed'}</p>
//                     <p><strong>Order:</strong> #${order.orderNumber}</p>
//                     ${action === 'approve'
//                     ? `<p><strong>Next Step:</strong> Pickup will be scheduled as per your convenience</p>`
//                     : action === 'reject'
//                         ? `<p><strong>Reason:</strong> ${rejectionReason}</p>`
//                         : `<p><strong>Information Requested:</strong> ${adminNotes}</p>`
//                 }
//                     ${adminNotes && action !== 'reject' ? `<p><strong>Admin Notes:</strong> ${adminNotes}</p>` : ''}
//                   </div>

//                   <p>You can view the details in your Joyory account.</p>

//                   <p>Best regards,<br>
//                   Team Joyory</p>
//                 </div>
//                 `
//             );
//         } catch (emailError) {
//             console.error("Email sending failed:", emailError.message);
//         }

//         await session.commitTransaction();

//         res.status(200).json({
//             success: true,
//             message: `Return request ${action}ed successfully`,
//             data: {
//                 status: returnRequest.overallStatus,
//                 nextSteps: action === 'approve'
//                     ? (schedulePickup ? "Pickup scheduled with courier" : "Pickup will be scheduled")
//                     : action === 'reject'
//                         ? "Request has been rejected"
//                         : "Waiting for user response",
//                 pickupDetails: returnRequest.pickupDetails
//             }
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Review return error:", error);
//         res.status(500).json({
//             success: false,
//             message: error.message || "Failed to process review"
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// // 5. Schedule Pickup (Admin) - Alternative endpoint for manual scheduling
// export const schedulePickup = async (req, res) => {
//     const session = await mongoose.startSession();

//     try {
//         session.startTransaction();

//         const { orderId, returnId, courier, scheduledDate, timeSlot, pickupAddress } = req.body;
//         const adminId = req.user?._id;

//         const order = await Order.findById(orderId)
//             .populate('user')
//             .session(session);

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         const returnRequest = order.returns.id(returnId);
//         if (!returnRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return request not found"
//             });
//         }

//         // Check if return is approved
//         if (returnRequest.overallStatus !== "approved") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Return must be approved before scheduling pickup"
//             });
//         }

//         // Validate pickup address serviceability
//         const serviceability = await validatePickupServiceability(pickupAddress.pincode);
//         if (!serviceability.serviceable) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Pickup location is not serviceable by our courier partners"
//             });
//         }

//         // Create Shiprocket return order
//         const shiprocketResult = await createShiprocketReturnOrder(
//             order,
//             returnRequest,
//             pickupAddress
//         );

//         // Update pickup details
//         returnRequest.pickupDetails = {
//             scheduledDate: new Date(scheduledDate),
//             timeSlot: timeSlot || "9 AM - 6 PM",
//             pickupAddress,
//             shiprocket_order_id: shiprocketResult.shiprocket_order_id,
//             shipment_id: shiprocketResult.shipment_id,
//             awb: shiprocketResult.awb_code,
//             courier: courier || shiprocketResult.courier_name,
//             trackingUrl: shiprocketResult.tracking_url,
//             scheduledBy: adminId,
//             scheduledAt: new Date()
//         };

//         returnRequest.overallStatus = "pickup_scheduled";

//         returnRequest.auditTrail.push({
//             status: "pickup_scheduled",
//             action: "pickup_scheduled",
//             performedBy: adminId,
//             performedByModel: "Admin",
//             notes: `Pickup scheduled with ${courier || shiprocketResult.courier_name} for ${new Date(scheduledDate).toLocaleDateString()}`,
//             metadata: { shiprocketResult }
//         });

//         await order.save({ session });

//         // Send notification to user
//         try {
//             await sendEmail(
//                 order.user.email,
//                 "📦 Pickup Scheduled for Your Return - Joyory",
//                 `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                   <h2 style="color: #333;">Pickup Scheduled</h2>
//                   <p>Dear ${order.user.name},</p>
//                   <p>Pickup has been scheduled for your return request for Order #${order.orderNumber}.</p>

//                   <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                     <h3 style="margin-top: 0;">Pickup Details:</h3>
//                     <p><strong>Courier:</strong> ${courier || shiprocketResult.courier_name}</p>
//                     <p><strong>Scheduled Date:</strong> ${new Date(scheduledDate).toLocaleDateString()}</p>
//                     <p><strong>Time Slot:</strong> ${timeSlot || "9 AM - 6 PM"}</p>
//                     <p><strong>AWB Number:</strong> ${shiprocketResult.awb_code}</p>
//                     <p><strong>Tracking:</strong> <a href="${shiprocketResult.tracking_url}">Track Shipment</a></p>
//                   </div>

//                   <p><strong>Please ensure:</strong></p>
//                   <ul>
//                     <li>Products are in original packaging</li>
//                     <li>Invoice is included</li>
//                     <li>All accessories and free gifts are returned</li>
//                     <li>Pack the items securely</li>
//                   </ul>

//                   <p>Best regards,<br>
//                   Team Joyory</p>
//                 </div>
//                 `
//             );
//         } catch (emailError) {
//             console.error("Email sending failed:", emailError.message);
//         }

//         await session.commitTransaction();

//         res.status(200).json({
//             success: true,
//             message: "Pickup scheduled successfully",
//             data: {
//                 shiprocket_order_id: shiprocketResult.shiprocket_order_id,
//                 awb: shiprocketResult.awb_code,
//                 trackingUrl: shiprocketResult.tracking_url,
//                 courier: courier || shiprocketResult.courier_name,
//                 scheduledDate,
//                 nextSteps: "User will be notified and courier will pick up the package"
//             }
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Schedule pickup error:", error);
//         res.status(500).json({
//             success: false,
//             message: error.message || "Failed to schedule pickup"
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// // 6. Update Pickup Status
// export const updatePickupStatus = async (req, res) => {
//     const session = await mongoose.startSession();

//     try {
//         session.startTransaction();

//         const { orderId, returnId, status, location, description } = req.body;
//         const adminId = req.user?._id;

//         const order = await Order.findById(orderId)
//             .populate('user')
//             .session(session);

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         const returnRequest = order.returns.id(returnId);
//         if (!returnRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Return request not found"
//             });
//         }

//         // Define status flow
//         const statusFlow = {
//             "pickup_scheduled": ["picked_up", "pickup_rescheduled", "failed"],
//             "picked_up": ["in_transit", "failed"],
//             "in_transit": ["received_at_warehouse", "delayed", "lost"],
//             "received_at_warehouse": ["quality_check"]
//         };

//         // Validate status transition
//         const allowedNextStatuses = statusFlow[returnRequest.overallStatus] || [];
//         if (!allowedNextStatuses.includes(status)) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Cannot transition from ${returnRequest.overallStatus} to ${status}`
//             });
//         }

//         // Update status
//         returnRequest.overallStatus = status;

//         if (status === "picked_up") {
//             returnRequest.pickupDetails.pickedUpAt = new Date();
//         } else if (status === "received_at_warehouse") {
//             returnRequest.receivedAt = new Date();
//         }

//         // Add to audit trail
//         returnRequest.auditTrail.push({
//             status: status,
//             action: "status_updated",
//             performedBy: adminId,
//             performedByModel: "Admin",
//             notes: description || `Status updated to ${status}`,
//             metadata: { location, description }
//         });

//         // Add tracking history if pickup details exist
//         if (returnRequest.pickupDetails) {
//             returnRequest.pickupDetails.trackingHistory = returnRequest.pickupDetails.trackingHistory || [];
//             returnRequest.pickupDetails.trackingHistory.push({
//                 status,
//                 location,
//                 description,
//                 timestamp: new Date()
//             });
//         }

//         await order.save({ session });

//         // Send notification for major status updates
//         const notifyStatuses = ["picked_up", "received_at_warehouse", "failed", "lost"];
//         if (notifyStatuses.includes(status)) {
//             try {
//                 await sendEmail(
//                     order.user.email,
//                     `Return Status Updated: ${status} - Joyory`,
//                     `
//                     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                       <h2 style="color: #333;">Return Status Update</h2>
//                       <p>Dear ${order.user.name},</p>
//                       <p>The status of your return for Order #${order.orderNumber} has been updated.</p>

//                       <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                         <h3 style="margin-top: 0;">Update Details:</h3>
//                         <p><strong>New Status:</strong> ${status.replace(/_/g, ' ').toUpperCase()}</p>
//                         <p><strong>Location:</strong> ${location || 'Not specified'}</p>
//                         <p><strong>Description:</strong> ${description || 'No additional details'}</p>
//                         ${returnRequest.pickupDetails?.awb ? `<p><strong>AWB:</strong> ${returnRequest.pickupDetails.awb}</p>` : ''}
//                       </div>

//                       <p>You can track your return in your Joyory account.</p>

//                       <p>Best regards,<br>
//                       Team Joyory</p>
//                     </div>
//                     `
//                 );
//             } catch (emailError) {
//                 console.error("Email sending failed:", emailError.message);
//             }
//         }

//         await session.commitTransaction();

//         res.status(200).json({
//             success: true,
//             message: "Pickup status updated successfully",
//             data: {
//                 status,
//                 updatedAt: new Date()
//             }
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Update pickup status error:", error);
//         res.status(500).json({
//             success: false,
//             message: error.message || "Failed to update pickup status"
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// // 7. Process Return After Receiving at Warehouse
// export const processReturn = async (req, res) => {
//     const session = await mongoose.startSession();

//     try {
//         session.startTransaction();

//         const { orderId, returnId, qualityCheck, refundMethod } = req.body;
//         const adminId = req.user?._id;

//         const order = await Order.findById(orderId)
//             .populate('user')
//             .session(session);

//         const returnRequest = order.returns.id(returnId);

//         if (!returnRequest || returnRequest.overallStatus !== "received_at_warehouse") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Return not ready for processing or not found"
//             });
//         }

//         // Perform quality check
//         returnRequest.qualityCheck = {
//             checkedBy: adminId,
//             checkedAt: new Date(),
//             condition: qualityCheck.condition,
//             notes: qualityCheck.notes,
//             images: qualityCheck.images || [],
//         };

//         // Determine refund based on quality
//         let finalRefundAmount = 0;
//         let shouldRefund = true;
//         let rejectedItems = [];
//         let approvedItems = [];

//         for (const item of returnRequest.items) {
//             const quality = qualityCheck.items?.find(q => String(q.productId) === String(item.productId));

//             if (quality) {
//                 if (quality.status === "acceptable") {
//                     // Full or partial refund based on condition
//                     const conditionMultiplier = {
//                         "excellent": 1.0,
//                         "good": 0.8,
//                         "fair": 0.5,
//                         "poor": 0
//                     };

//                     const multiplier = conditionMultiplier[quality.condition] || 0;
//                     const itemRefund = item.refundAmount * multiplier;
//                     finalRefundAmount += itemRefund;

//                     item.status = "approved_for_refund";
//                     item.refundAmount = itemRefund;
//                     approvedItems.push({
//                         productId: item.productId,
//                         refundAmount: itemRefund
//                     });

//                     // Restock if product is in good condition
//                     if (quality.condition !== "poor") {
//                         await restockProduct(item.productId, item.quantity, item.variant?.sku, session);
//                     }
//                 } else {
//                     item.status = "rejected";
//                     rejectedItems.push({
//                         productId: item.productId,
//                         reason: quality.reason || "Quality check failed"
//                     });
//                     shouldRefund = false;
//                 }
//             }
//         }

//         if (shouldRefund && finalRefundAmount > 0) {
//             // Update return status
//             returnRequest.overallStatus = "approved_for_refund";
//             returnRequest.refund.amount = finalRefundAmount;
//             returnRequest.refund.method = refundMethod;

//             // Initiate refund based on method
//             if (refundMethod === "original") {
//                 // Process Razorpay refund through queue
//                 await processRazorpayRefund(order, finalRefundAmount, returnId, session);
//                 returnRequest.refund.status = "initiated";
//             } else if (refundMethod === "wallet") {
//                 // Credit to user's wallet
//                 await creditToWallet(order.user, finalRefundAmount, "return_refund", session);
//                 returnRequest.refund.status = "completed";
//                 returnRequest.overallStatus = "refunded";
//             } else if (refundMethod === "voucher") {
//                 // Create store credit voucher
//                 returnRequest.refund.status = "completed";
//                 returnRequest.overallStatus = "refunded";
//                 // You would implement voucher creation here
//             }

//             returnRequest.auditTrail.push({
//                 status: returnRequest.refund.status,
//                 action: "refund_processed",
//                 performedBy: adminId,
//                 performedByModel: "Admin",
//                 notes: `Refund of ₹${finalRefundAmount} initiated via ${refundMethod}`,
//                 metadata: { refundMethod, amount: finalRefundAmount }
//             });

//             // Send refund initiated email
//             await sendEmail(
//                 order.user.email,
//                 "💰 Refund Initiated for Your Return - Joyory",
//                 `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                   <h2 style="color: #333;">Refund Initiated</h2>
//                   <p>Dear ${order.user.name},</p>
//                   <p>We have processed your return for Order #${order.orderNumber} and initiated your refund.</p>

//                   <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                     <h3 style="margin-top: 0;">Refund Details:</h3>
//                     <p><strong>Amount:</strong> ₹${finalRefundAmount}</p>
//                     <p><strong>Method:</strong> ${refundMethod === 'original' ? 'Original Payment Method' : refundMethod === 'wallet' ? 'Joyory Wallet' : 'Store Voucher'}</p>
//                     <p><strong>Status:</strong> ${returnRequest.refund.status}</p>
//                     <p><strong>Estimated Time:</strong> ${refundMethod === 'original' ? '5-7 business days' : 'Instant'}</p>
//                   </div>

//                   <p>You will receive a confirmation once the refund is completed.</p>

//                   <p>Thank you for shopping with Joyory!</p>

//                   <p>Best regards,<br>
//                   Team Joyory</p>
//                 </div>
//                 `
//             );
//         } else {
//             returnRequest.overallStatus = "rejected";
//             returnRequest.refund.status = "failed";
//             returnRequest.auditTrail.push({
//                 status: "rejected",
//                 action: "quality_check_failed",
//                 performedBy: adminId,
//                 performedByModel: "Admin",
//                 notes: "Items failed quality check",
//                 metadata: { qualityCheck, rejectedItems }
//             });

//             // Send rejection email
//             await sendEmail(
//                 order.user.email,
//                 "⚠️ Return Processing Update - Joyory",
//                 `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                   <h2 style="color: #333;">Return Request Rejected</h2>
//                   <p>Dear ${order.user.name},</p>
//                   <p>We have processed your return for Order #${order.orderNumber} but unfortunately, it did not pass our quality check.</p>

//                   <div style="background: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                     <h3 style="margin-top: 0;">Rejection Details:</h3>
//                     <p><strong>Reason:</strong> Products did not meet quality standards</p>
//                     ${rejectedItems.length > 0 ? `<p><strong>Rejected Items:</strong> ${rejectedItems.map(item => item.productId).join(', ')}</p>` : ''}
//                     <p><strong>Admin Notes:</strong> ${qualityCheck.notes || 'Please refer to our return policy for acceptable conditions'}</p>
//                   </div>

//                   <p>If you have any questions, please contact our support team.</p>

//                   <p>Best regards,<br>
//                   Team Joyory</p>
//                 </div>
//                 `
//             );
//         }

//         await order.save({ session });
//         await session.commitTransaction();

//         res.status(200).json({
//             success: true,
//             message: shouldRefund
//                 ? `Refund of ₹${finalRefundAmount} initiated successfully`
//                 : "Return rejected due to quality issues",
//             data: {
//                 refundAmount: finalRefundAmount,
//                 refundMethod,
//                 refundStatus: returnRequest.refund.status,
//                 estimatedTime: refundMethod === "original" ? "5-7 business days" : "Instant",
//                 approvedItems,
//                 rejectedItems
//             }
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Process return error:", error);
//         res.status(500).json({
//             success: false,
//             message: error.message || "Failed to process return"
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// // 8. Get All Returns (Admin)
// export const getAllReturns = async (req, res) => {
//     try {
//         const {
//             page = 1,
//             limit = 20,
//             status,
//             returnType,
//             startDate,
//             endDate,
//             search
//         } = req.query;

//         // Build query
//         let query = { returns: { $exists: true, $ne: [] } };

//         if (status) {
//             query["returns.overallStatus"] = status;
//         }

//         if (returnType) {
//             query["returns.returnType"] = returnType;
//         }

//         if (startDate || endDate) {
//             query["returns.requestedAt"] = {};
//             if (startDate) query["returns.requestedAt"].$gte = new Date(startDate);
//             if (endDate) query["returns.requestedAt"].$lte = new Date(endDate);
//         }

//         if (search) {
//             query.$or = [
//                 { orderNumber: { $regex: search, $options: 'i' } },
//                 { "user.name": { $regex: search, $options: 'i' } },
//                 { "user.email": { $regex: search, $options: 'i' } }
//             ];
//         }

//         // Get total count
//         const total = await Order.countDocuments(query);

//         // Get orders with returns
//         const orders = await Order.find(query)
//             .populate('user', 'name email phone')
//             .populate('returns.requestedBy', 'name email')
//             .populate('returns.approvedBy', 'name email')
//             .populate('returns.items.productId', 'name sku images')
//             .sort({ "returns.requestedAt": -1 })
//             .skip((page - 1) * limit)
//             .limit(parseInt(limit));

//         // Extract and flatten returns
//         const allReturns = [];
//         orders.forEach(order => {
//             order.returns.forEach(ret => {
//                 allReturns.push({
//                     orderId: order._id,
//                     orderNumber: order.orderNumber,
//                     customer: order.user,
//                     returnId: ret._id,
//                     returnType: ret.returnType,
//                     status: ret.overallStatus,
//                     requestedAt: ret.requestedAt,
//                     items: ret.items,
//                     refundAmount: ret.refund?.amount,
//                     refundMethod: ret.refund?.method,
//                     refundStatus: ret.refund?.status,
//                     approvedBy: ret.approvedBy,
//                     approvedAt: ret.approvedAt,
//                     pickupScheduled: ret.pickupDetails?.scheduledDate,
//                     awb: ret.pickupDetails?.awb
//                 });
//             });
//         });

//         // Statistics
//         const stats = {
//             totalReturns: total,
//             pending: await Order.countDocuments({ "returns.overallStatus": { $in: ["requested", "pending_approval"] } }),
//             approved: await Order.countDocuments({ "returns.overallStatus": "approved" }),
//             inProgress: await Order.countDocuments({ "returns.overallStatus": { $in: ["pickup_scheduled", "picked_up", "in_transit"] } }),
//             completed: await Order.countDocuments({ "returns.overallStatus": { $in: ["refunded", "replacement_delivered"] } }),
//             rejected: await Order.countDocuments({ "returns.overallStatus": "rejected" })
//         };

//         res.status(200).json({
//             success: true,
//             data: {
//                 returns: allReturns,
//                 pagination: {
//                     page: parseInt(page),
//                     limit: parseInt(limit),
//                     total,
//                     pages: Math.ceil(total / limit)
//                 },
//                 stats
//             }
//         });

//     } catch (error) {
//         console.error("Get all returns error:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch returns"
//         });
//     }
// };

// // 9. Get Return Policy
// export const getReturnPolicy = async (req, res) => {
//     try {
//         const returnPolicy = {
//             summary: "7 Days Return & Exchange Policy",
//             returnWindow: "7 days from delivery date",
//             conditions: [
//                 "Products must be in original condition",
//                 "Original packaging must be intact",
//                 "Invoice must be included",
//                 "All tags and labels must be attached",
//                 "Free gifts must be returned if applicable"
//             ],
//             nonReturnable: [
//                 "Personal care items (for hygiene reasons)",
//                 "Innerwear & hosiery",
//                 "Earrings",
//                 "Customized or personalized products",
//                 "Gift cards & vouchers",
//                 "Products marked as 'Non-Returnable'"
//             ],
//             refundMethods: [
//                 { method: "original", description: "Refund to original payment method", timeline: "5-7 business days" },
//                 { method: "wallet", description: "Joyory Wallet credit", timeline: "Instant" },
//                 { method: "voucher", description: "Store credit voucher", timeline: "Instant" }
//             ],
//             exchangePolicy: {
//                 allowed: true,
//                 conditions: [
//                     "Exchange for different size/shade only",
//                     "Product must be unused",
//                     "Original packaging required",
//                     "Exchange shipping charges may apply"
//                 ]
//             },
//             qualityCheck: "All returns undergo quality check at our warehouse",
//             contactSupport: "For any return-related queries, contact support@joyory.com"
//         };

//         res.status(200).json({
//             success: true,
//             data: returnPolicy
//         });

//     } catch (error) {
//         console.error("Get return policy error:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch return policy"
//         });
//     }
// };

// // 10. Check Return Eligibility
// export const checkReturnEligibility = async (req, res) => {
//     try {
//         const { orderId } = req.params;
//         const userId = req.user?._id;

//         const order = await Order.findById(orderId)
//             .populate('user')
//             .populate('products.productId');

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         // Verify ownership
//         if (String(order.user._id) !== String(userId)) {
//             return res.status(403).json({
//                 success: false,
//                 message: "Unauthorized"
//             });
//         }

//         // Check if order is delivered
//         if (order.orderStatus !== "Delivered") {
//             return res.status(400).json({
//                 success: false,
//                 eligible: false,
//                 reason: "Return can only be requested for delivered orders"
//             });
//         }

//         // Check return window
//         const deliveredDate = order.updatedAt;
//         const returnByDate = calculateReturnWindow(deliveredDate);
//         const today = new Date();
//         const daysLeft = Math.ceil((returnByDate - today) / (1000 * 60 * 60 * 24));

//         if (today > returnByDate) {
//             return res.status(200).json({
//                 success: true,
//                 eligible: false,
//                 reason: `Return window expired. Delivered on ${new Date(deliveredDate).toLocaleDateString()}`,
//                 daysLeft: 0,
//                 returnByDate
//             });
//         }

//         // Check if return already exists
//         const existingReturn = order.returns.find(
//             r => !["rejected", "cancelled", "completed"].includes(r.overallStatus)
//         );

//         if (existingReturn) {
//             return res.status(200).json({
//                 success: true,
//                 eligible: false,
//                 reason: "An active return request already exists for this order",
//                 existingReturnId: existingReturn._id,
//                 status: existingReturn.overallStatus
//             });
//         }

//         // Check product eligibility
//         const eligibleProducts = [];
//         const nonEligibleProducts = [];

//         for (const product of order.products) {
//             const productDetails = await Product.findById(product.productId);

//             if (productDetails?.returnable) {
//                 eligibleProducts.push({
//                     productId: product.productId._id,
//                     name: product.productId.name,
//                     quantity: product.quantity,
//                     price: product.price,
//                     variant: product.variant
//                 });
//             } else {
//                 nonEligibleProducts.push({
//                     productId: product.productId._id,
//                     name: product.productId.name,
//                     reason: "Product is marked as non-returnable"
//                 });
//             }
//         }

//         res.status(200).json({
//             success: true,
//             eligible: daysLeft > 0 && eligibleProducts.length > 0,
//             daysLeft: daysLeft > 0 ? daysLeft : 0,
//             returnByDate,
//             eligibleProducts,
//             nonEligibleProducts,
//             conditions: [
//                 "Product must be in original condition",
//                 "Original packaging required",
//                 "Invoice must be included",
//                 "All accessories must be returned"
//             ]
//         });

//     } catch (error) {
//         console.error("Check eligibility error:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to check return eligibility"
//         });
//     }
// };













// // controllers/returnController.js
// import mongoose from "mongoose";
// import Order from "../models/Order.js";
// import User from '../models/User.js';
// import { createShiprocketReturnOrder } from "../middlewares/services/shiprocket.js";
// import { uploadToCloudinary } from "../middlewares/upload.js";
// import { sendEmail } from "../middlewares/utils/emailService.js"; // ✅ assume you already have an email service


// export const requestReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { orderId } = req.params;

//         const { items, reason, reasonDescription = "" } = req.body;

//         // 1️⃣ Validate order
//         const order = await Order.findById(orderId);
//         if (!order) {
//             return res.status(404).json({ success: false, message: "Order not found" });
//         }

//         // Check owner
//         if (order.user.toString() !== userId.toString()) {
//             return res.status(403).json({ success: false, message: "Not your order" });
//         }

//         // Check delivered
//         if (order.orderStatus !== "Delivered") {
//             return res.status(400).json({
//                 success: false,
//                 message: "You can request return only after delivery"
//             });
//         }

//         // 2️⃣ Validate return window (7 days)
//         const deliveredAt = new Date(order.updatedAt); // usually delivered timestamp
//         const today = new Date();

//         const diffDays = Math.floor((today - deliveredAt) / (1000 * 60 * 60 * 24));

//         if (diffDays > (order.returnPolicy?.days || 7)) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Return window expired (${order.returnPolicy?.days || 7} days)`
//             });
//         }

//         // 3️⃣ Validate items
//         if (!Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({ success: false, message: "Items are required" });
//         }

//         const validatedItems = [];

//         for (const item of items) {
//             const { productId, quantity, variant } = item;

//             const found = order.products.find(
//                 p =>
//                     p.productId.toString() === productId &&
//                     p.variant.sku === variant.sku
//             );

//             if (!found) {
//                 return res.status(400).json({
//                     success: false,
//                     message: "Some items not found in order"
//                 });
//             }

//             if (quantity > found.quantity) {
//                 return res.status(400).json({
//                     success: false,
//                     message: "Invalid quantity requested"
//                 });
//             }

//             // 4️⃣ Upload images if available
//             let uploadedImages = [];

//             if (req.files && req.files[`images_${productId}`]) {
//                 const imgFiles = req.files[`images_${productId}`];

//                 for (const img of imgFiles) {
//                     const result = await uploadToCloudinary(
//                         img.buffer,
//                         `returns/${orderId}/${productId}`
//                     );

//                     uploadedImages.push(result.secure_url || result);
//                 }
//             }

//             validatedItems.push({
//                 _id: new mongoose.Types.ObjectId(),
//                 productId,
//                 quantity,
//                 variant,
//                 reason,
//                 reasonDescription,
//                 images: uploadedImages,
//                 status: "requested",
//                 condition: "Unopened",
//             });
//         }

//         // 5️⃣ Create return entry
//         const returnEntry = {
//             returnType: "return",
//             items: validatedItems,
//             overallStatus: "requested",
//             reason,
//             description: reasonDescription,
//             requestedBy: userId,
//             requestedAt: new Date(),
//             returnWindowValid: true,
//             returnByDate: new Date(deliveredAt.getTime() + (order.returnPolicy?.days || 7) * 86400000)
//         };

//         order.returns.push(returnEntry);
//         order.paymentStatus = "refund_requested";

//         await order.save();

//         return res.status(201).json({
//             success: true,
//             message: "Return request submitted",
//             returnId: returnEntry._id,
//             data: returnEntry
//         });

//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({
//             success: false,
//             message: "Something went wrong",
//             error: err.message
//         });
//     }
// };

// export const getMyReturns = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const orders = await Order.find({ user: userId, "returns.0": { $exists: true } })
//             .select("orderNumber returns createdAt")
//             .sort({ createdAt: -1 });

//         // return returns only (flatten per-order)
//         const flattened = [];
//         for (const o of orders) {
//             for (const r of o.returns) {
//                 flattened.push({
//                     orderId: o._id,
//                     orderNumber: o.orderNumber,
//                     return: r
//                 });
//             }
//         }

//         return res.json({ success: true, data: flattened });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// /**
//  * GET /api/returns/details/:orderId/:returnId
//  * Return details (user + admin)
//  */
// export const getReturnDetails = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;
//         const order = await Order.findById(orderId).populate("user", "name email");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const ret = order.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         // If user, ensure ownership
//         if (req.user && req.user._id && order.user._id.toString() !== req.user._id.toString() && !(req.admin && req.admin._id)) {
//             return res.status(403).json({ success: false, message: "Not authorized" });
//         }

//         return res.json({ success: true, data: { orderId: order._id, orderNumber: order.orderNumber, return: ret } });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// /**
//  * PUT /api/returns/cancel/:orderId/:returnId
//  * User cancels a return request if still 'requested'
//  */
// export const cancelReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { orderId, returnId } = req.params;

//         const order = await Order.findById(orderId);
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         if (order.user.toString() !== userId.toString()) {
//             return res.status(403).json({ success: false, message: "Not your order" });
//         }

//         const ret = order.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (ret.overallStatus !== "requested") {
//             return res.status(400).json({ success: false, message: "Cannot cancel once processed" });
//         }

//         ret.overallStatus = "cancelled";
//         ret.auditTrail.push({
//             status: "cancelled",
//             action: "user_cancelled",
//             performedBy: userId,
//             performedByModel: "User",
//             timestamp: new Date(),
//             notes: req.body?.notes || "User cancelled the request"
//         });

//         await order.save();

//         // email admin (optional) + user confirmation
//         await sendEmail(req.user.email, `Return Cancelled - Order ${order.orderNumber}`, `
//       <p>Your return request for Order #${order.orderNumber} has been cancelled successfully.</p>
//     `);

//         return res.json({ success: true, message: "Return cancelled" });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// /**
//  * PUT /api/returns/admin/received/:orderId/:returnId
//  * Admin marks returned package as received at warehouse (manual override)
//  * -> triggers refund flow similar to cron
//  */
// export const markReturnReceived = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;
//         const order = await Order.findById(orderId);
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const ret = order.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (ret.overallStatus === "received_at_warehouse" || ret.overallStatus === "refunded") {
//             return res.status(400).json({ success: false, message: "Already received/refunded" });
//         }

//         ret.overallStatus = "received_at_warehouse";
//         ret.receivedAt = new Date();
//         ret.auditTrail.push({
//             status: "received_at_warehouse",
//             action: "admin_mark_received",
//             performedBy: req.admin._id,
//             performedByModel: "Admin",
//             timestamp: new Date(),
//             notes: req.body?.notes || "Marked received by admin"
//         });

//         // Save first so refund worker has latest document
//         await order.save();

//         // Trigger refund job
//         await addRefundJob(order._id, {
//             orderId: order._id,
//             returnId: ret._id,
//             amount: ret.refund?.amount || order.amount
//         });

//         // notify user
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Received - Order ${order.orderNumber}`,
//                 `<p>Hi ${order.user.name || ""},</p>
//          <p>Your returned item(s) for Order #${order.orderNumber} were received at our warehouse. Refund will be processed shortly.</p>`
//             );
//         }

//         return res.json({ success: true, message: "Return marked received and refund triggered" });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Admin endpoints

// // GET all return requests
// export const getAllReturns = async (req, res) => {
//     try {
//         const orders = await Order.find({ "returns.0": { $exists: true } })
//             .populate("user", "name email")
//             .sort({ createdAt: -1 });

//         return res.json({ success: true, data: orders });
//     } catch (e) {
//         return res.status(500).json({ success: false, message: e.message });
//     }
// };

// // APPROVE return
// export const approveReturn = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;

//         const order = await Order.findById(orderId).populate("user");

//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const r = order.returns.id(returnId);
//         if (!r) return res.status(404).json({ success: false, message: "Return request not found" });

//         if (r.overallStatus !== "requested") {
//             return res.status(400).json({ success: false, message: "Already processed" });
//         }

//         r.overallStatus = "approved";
//         r.auditTrail.push({
//             status: "approved",
//             action: "admin_approved",
//             performedBy: req.admin._id,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         // 🔥 Create Shiprocket RETURN order
//         const result = await createShiprocketReturnOrder(order, r);

//         return res.json({
//             success: true,
//             message: "Return approved & Shiprocket return order created",
//             shiprocket: result
//         });

//     } catch (e) {
//         console.error(e);
//         return res.status(500).json({ success: false, message: e.message });
//     }
// };

// // REJECT return
// export const rejectReturn = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;
//         const { reason } = req.body;

//         const order = await Order.findById(orderId).populate("user");

//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const r = order.returns.id(returnId);
//         if (!r) return res.status(404).json({ success: false, message: "Return request not found" });

//         if (r.overallStatus !== "requested") {
//             return res.status(400).json({ success: false, message: "Already processed" });
//         }

//         r.overallStatus = "rejected";
//         r.adminRejectionReason = reason;

//         r.auditTrail.push({
//             status: "rejected",
//             action: "admin_rejected",
//             notes: reason,
//             performedBy: req.admin._id,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         // EMAIL USER
//         await sendEmail(
//             order.user.email,
//             "❌ Return Request Rejected - Joyory",
//             `
//             <h3>Your return request has been rejected</h3>
//             <p><b>Order:</b> #${order.orderNumber}</p>
//             <p><b>Reason:</b> ${reason}</p>
//             `
//         );

//         return res.json({ success: true, message: "Return rejected & user notified" });

//     } catch (e) {
//         return res.status(500).json({ success: false, message: e.message });
//     }
// };




// // controllers/returnController.js
// import mongoose from "mongoose";
// import Order from "../models/Order.js";
// import User from "../models/User.js";
// import { createShiprocketReturnOrder } from "../middlewares/services/shiprocket.js";
// import { uploadToCloudinary } from "../middlewares/upload.js";
// import { sendEmail } from "../middlewares/utils/emailService.js";
// import { addRefundJob } from "../middlewares/services/refundQueue.js"; // assume you have this

// // ✅ Helper to validate ObjectId
// const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// // ---------------------- USER ENDPOINTS ----------------------

// // Request Return
// export const requestReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { orderId } = req.params;
//         const { items, reason, reasonDescription = "" } = req.body;

//         if (!isValidId(orderId)) {
//             return res.status(400).json({ success: false, message: "Invalid orderId" });
//         }

//         // 1️⃣ Validate order
//         const order = await Order.findById(orderId);
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         if (order.user.toString() !== userId.toString()) {
//             return res.status(403).json({ success: false, message: "Not your order" });
//         }

//         if (order.orderStatus !== "Delivered") {
//             return res.status(400).json({ success: false, message: "Return only allowed after delivery" });
//         }

//         // 2️⃣ Return window
//         const deliveredAt = new Date(order.updatedAt);
//         const diffDays = Math.floor((new Date() - deliveredAt) / (1000 * 60 * 60 * 24));
//         if (diffDays > (order.returnPolicy?.days || 7)) {
//             return res.status(400).json({ success: false, message: `Return window expired (${order.returnPolicy?.days || 7} days)` });
//         }

//         // 3️⃣ Validate items
//         if (!Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({ success: false, message: "Items are required" });
//         }

//         const validatedItems = [];

//         for (const item of items) {
//             const { productId, quantity, variant, condition } = item;

//             if (!isValidId(productId)) {
//                 return res.status(400).json({ success: false, message: `Invalid productId: ${productId}` });
//             }

//             const found = order.products.find(p => {
//                 if (!p) return false;
//                 if (variant) {
//                     return p.productId.toString() === productId && p.variant?.sku === variant.sku;
//                 }
//                 return p.productId.toString() === productId;
//             });

//             if (!found) return res.status(400).json({ success: false, message: "Some items not found in order" });
//             if (quantity > found.quantity) return res.status(400).json({ success: false, message: "Invalid quantity requested" });

//             // 3️⃣a Check if a return already exists for this product & variant
//             const alreadyRequested = order.returns.some(r =>
//                 r.items.some(i =>
//                     i.productId.toString() === productId &&
//                     (!variant || (i.variant?.sku === variant.sku)) &&
//                     ["requested", "approved", "received_at_warehouse"].includes(i.status)
//                 )
//             );

//             if (alreadyRequested) {
//                 return res.status(400).json({
//                     success: false,
//                     message: `Return for product ${productId} already requested. Please cancel the existing return first.`
//                 });
//             }

//             // Upload images if available
//             let uploadedImages = [];
//             if (req.files && req.files[`images_${productId}`]) {
//                 const imgFiles = req.files[`images_${productId}`];
//                 for (const img of imgFiles) {
//                     const result = await uploadToCloudinary(img.buffer, `returns/${orderId}/${productId}`);
//                     uploadedImages.push(result.secure_url || result);
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
//                 status: "requested",
//                 condition: condition || "Unopened"
//             });
//         }

//         // 4️⃣ Create return entry
//         const returnEntry = {
//             returnType: "return",
//             items: validatedItems,
//             overallStatus: "requested",
//             reason,
//             description: reasonDescription,
//             requestedBy: userId,
//             requestedAt: new Date(),
//             returnWindowValid: true,
//             returnByDate: new Date(deliveredAt.getTime() + (order.returnPolicy?.days || 7) * 86400000),
//         };

//         order.returns.push(returnEntry);
//         order.paymentStatus = "refund_requested";

//         await order.save();

//         // 5️⃣ Send confirmation email to user
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Request Received - Order ${order.orderNumber}`,
//                 `
//                 <h3>Hi ${order.user.name || ""},</h3>
//                 <p>Your return request for Order #${order.orderNumber} has been received by our team.</p>
//                 <p>Reason: ${reason}</p>
//                 <p>We will review it shortly. You can track the status in your account.</p>
//                 <br/>
//                 <p>Thank you,<br/>Joyory Team</p>
//                 `
//             );
//         }

//         return res.status(201).json({
//             success: true,
//             message: "Return request submitted and confirmation email sent",
//             returnId: returnEntry._id,
//             data: returnEntry
//         });

//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: "Something went wrong", error: err.message });
//     }
// };

// // Get my returns
// export const getMyReturns = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const orders = await Order.find({ user: userId, "returns.0": { $exists: true } })
//             .select("orderNumber returns createdAt")
//             .sort({ createdAt: -1 });

//         const flattened = [];
//         for (const o of orders) {
//             for (const r of o.returns) {
//                 flattened.push({ orderId: o._id, orderNumber: o.orderNumber, return: r });
//             }
//         }

//         return res.json({ success: true, data: flattened });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Get return details
// export const getReturnDetails = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;
//         if (!isValidId(orderId) || !isValidId(returnId))
//             return res.status(400).json({ success: false, message: "Invalid orderId or returnId" });

//         const order = await Order.findById(orderId).populate("user", "name email");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const ret = order.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (req.user && req.user._id && order.user._id.toString() !== req.user._id.toString() && !(req.admin && req.admin._id))
//             return res.status(403).json({ success: false, message: "Not authorized" });

//         return res.json({ success: true, data: { orderId: order._id, orderNumber: order.orderNumber, return: ret } });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Cancel return
// export const cancelReturn = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { orderId, returnId } = req.params;
//         if (!isValidId(orderId) || !isValidId(returnId))
//             return res.status(400).json({ success: false, message: "Invalid orderId or returnId" });

//         const order = await Order.findById(orderId);
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });
//         if (order.user.toString() !== userId.toString())
//             return res.status(403).json({ success: false, message: "Not your order" });

//         const ret = order.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });
//         if (ret.overallStatus !== "requested") return res.status(400).json({ success: false, message: "Cannot cancel once processed" });

//         ret.overallStatus = "cancelled";
//         ret.auditTrail.push({
//             status: "cancelled",
//             action: "user_cancelled",
//             performedBy: userId,
//             performedByModel: "User",
//             timestamp: new Date(),
//             notes: req.body?.notes || "User cancelled the request",
//         });

//         await order.save();

//         await sendEmail(req.user.email, `Return Cancelled - Order ${order.orderNumber}`, `<p>Your return request for Order #${order.orderNumber} has been cancelled successfully.</p>`);

//         return res.json({ success: true, message: "Return cancelled" });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ---------------------- ADMIN ENDPOINTS ----------------------

// // Mark return received
// export const markReturnReceived = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;
//         if (!isValidId(orderId) || !isValidId(returnId))
//             return res.status(400).json({ success: false, message: "Invalid orderId or returnId" });

//         const order = await Order.findById(orderId);
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const ret = order.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (["received_at_warehouse", "refunded"].includes(ret.overallStatus))
//             return res.status(400).json({ success: false, message: "Already received/refunded" });

//         ret.overallStatus = "received_at_warehouse";
//         ret.receivedAt = new Date();
//         ret.auditTrail.push({
//             status: "received_at_warehouse",
//             action: "admin_mark_received",
//             performedBy: req.admin._id,
//             performedByModel: "Admin",
//             timestamp: new Date(),
//             notes: req.body?.notes || "Marked received by admin",
//         });

//         await order.save();

//         await addRefundJob(order._id, { orderId: order._id, returnId: ret._id, amount: ret.refund?.amount || order.amount });

//         if (order.user?.email)
//             await sendEmail(order.user.email, `Return Received - Order ${order.orderNumber}`, `<p>Hi ${order.user.name || ""},</p><p>Your returned item(s) for Order #${order.orderNumber} were received at our warehouse. Refund will be processed shortly.</p>`);

//         return res.json({ success: true, message: "Return marked received and refund triggered" });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Get all returns
// export const getAllReturns = async (req, res) => {
//     try {
//         const orders = await Order.find({ "returns.0": { $exists: true } })
//             .populate("user", "name email")
//             .sort({ createdAt: -1 });

//         return res.json({ success: true, data: orders });
//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Approve return safely with user email notification
// export const approveReturn = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;
//         if (!isValidId(orderId) || !isValidId(returnId))
//             return res.status(400).json({ success: false, message: "Invalid orderId or returnId" });

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const r = order.returns.id(returnId);
//         if (!r) return res.status(404).json({ success: false, message: "Return request not found" });
//         if (r.overallStatus !== "requested") return res.status(400).json({ success: false, message: "Already processed" });

//         // Try Shiprocket first
//         let shiprocketResult;
//         try {
//             shiprocketResult = await createShiprocketReturnOrder(order, r);
//         } catch (shipErr) {
//             console.error("[Shiprocket Error]", shipErr.message);
//             return res.status(422).json({
//                 success: false,
//                 message: "Failed to create Shiprocket return order",
//                 error: shipErr.message
//             });
//         }

//         // Update return status only if Shiprocket succeeded
//         r.overallStatus = "approved";
//         r.auditTrail.push({
//             status: "approved",
//             action: "admin_approved",
//             performedBy: req.admin?._id || null,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         // Send email to user
//         try {
//             await sendEmail(
//                 order.user.email,
//                 "✅ Your Return Request is Approved - Joyory",
//                 `<h3>Your return request has been approved by our admin</h3>
//                 <p><b>Order:</b> #${order.orderNumber}</p>
//                 <p><b>Return ID:</b> ${r._id}</p>
//                 <p>You will receive instructions for shipping your product back shortly.</p>
//                 <p>Thank you for shopping with Joyory!</p>`
//             );
//         } catch (emailErr) {
//             console.error("[Email Error]", emailErr.message);
//         }

//         return res.json({
//             success: true,
//             message: "Return approved, Shiprocket order created & user notified",
//             shiprocket: shiprocketResult
//         });

//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Reject return
// export const rejectReturn = async (req, res) => {
//     try {
//         const { orderId, returnId } = req.params;
//         const { reason } = req.body;
//         if (!isValidId(orderId) || !isValidId(returnId))
//             return res.status(400).json({ success: false, message: "Invalid orderId or returnId" });

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         const r = order.returns.id(returnId);
//         if (!r) return res.status(404).json({ success: false, message: "Return request not found" });
//         if (r.overallStatus !== "requested") return res.status(400).json({ success: false, message: "Already processed" });

//         r.overallStatus = "rejected";
//         r.adminRejectionReason = reason;
//         r.auditTrail.push({
//             status: "rejected",
//             action: "admin_rejected",
//             notes: reason,
//             performedBy: req.admin?._id || null,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         await sendEmail(order.user.email, "❌ Return Request Rejected - Joyory", `<h3>Your return request has been rejected</h3><p><b>Order:</b> #${order.orderNumber}</p><p><b>Reason:</b> ${reason}</p>`);

//         return res.json({ success: true, message: "Return rejected & user notified" });
//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

















// controllers/shipmentReturnController.js
import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { createShiprocketReturnOrder } from "../middlewares/services/shiprocket.js";
import { uploadToCloudinary } from "../middlewares/upload.js";
import { sendEmail } from "../middlewares/utils/emailService.js";
import { addRefundJob } from "../middlewares/services/refundQueue.js";

// ✅ Helper to validate ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ---------------------- USER ENDPOINTS ----------------------

export const requestShipmentReturn = async (req, res) => {
    try {
        const userId = req.user._id;
        const { shipment_id } = req.params; // Shiprocket shipment_id
        const { items, reason, reasonDescription = "" } = req.body;

        if (!shipment_id) {
            return res.status(400).json({ success: false, message: "shipment_id is required" });
        }

        // 1️⃣ Find order containing this shipment (Shiprocket shipment_id)
        const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
        if (!order) {
            return res.status(404).json({ success: false, message: "Shipment not found" });
        }

        // Get specific shipment
        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: "Shipment not found" });
        }

        // Ensure the requesting user owns this order
        if (order.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not your shipment" });
        }

        // 2️⃣ Return window check (safe fallback)
        const deliveredAt = shipment.deliveredAt || order.deliveredAt || order.updatedAt;
        const allowedDays = order.returnPolicy?.days || 7;

        const diffDays = Math.floor(
            (Date.now() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays > allowedDays) {
            return res.status(400).json({
                success: false,
                message: `Return window expired (${allowedDays} days)`
            });
        }

        // 3️⃣ Items validation
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Items are required" });
        }

        const validatedItems = [];

        for (const item of items) {
            const { productId, quantity, variant, condition } = item;

            if (!productId) {
                return res.status(400).json({ success: false, message: "Invalid productId" });
            }

            // Check item belongs to shipment
            const found = shipment.products.find(p => {
                if (!p) return false;
                if (variant) {
                    return (
                        p.productId.toString() === productId &&
                        p.variant?.sku === variant.sku
                    );
                }
                return p.productId.toString() === productId;
            });

            if (!found) {
                return res.status(400).json({
                    success: false,
                    message: "Some items not found in this shipment"
                });
            }

            if (quantity > found.quantity) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid quantity requested"
                });
            }

            // Prevent duplicate return requests for same product
            const duplicate = shipment.returns?.some(r =>
                r.items.some(i =>
                    i.productId.toString() === productId &&
                    (!variant || i.variant?.sku === variant.sku) &&
                    ["requested", "approved", "received_at_warehouse"].includes(i.status)
                )
            );

            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message: `Return already requested for product ${productId}`
                });
            }

            // Upload images (optional)
            let uploadedImages = [];
            const fieldKey = `images_${productId}`;

            if (req.files && req.files[fieldKey]) {
                const imgFiles = req.files[fieldKey];

                for (const img of imgFiles) {
                    const result = await uploadToCloudinary(
                        img.buffer,
                        `returns/${shipment_id}/${productId}`
                    );
                    uploadedImages.push(result.secure_url ?? result);
                }
            }

            validatedItems.push({
                _id: new mongoose.Types.ObjectId(),
                productId,
                quantity,
                ...(variant ? { variant } : {}),
                reason,
                reasonDescription,
                images: uploadedImages,
                condition: condition || "Unopened",
                status: "requested"
            });
        }

        // 4️⃣ Build return entry (Safe + includes _id)
        const returnEntry = {
            _id: new mongoose.Types.ObjectId(),
            returnType: "return",
            items: validatedItems,
            overallStatus: "requested",
            reason,
            description: reasonDescription,
            requestedBy: userId,
            requestedAt: new Date(),
            returnWindowValid: true,
            returnByDate: new Date(
                new Date(deliveredAt).getTime() + allowedDays * 86400000
            ),
            // These fields will be used by return-flow cron later
            shipmentInfo: {},
            timeline: [],
            auditTrail: []
        };

        // Push into shipment.returns safely
        if (!shipment.returns) shipment.returns = [];
        shipment.returns.push(returnEntry);

        await order.save();

        // 5️⃣ Send mail
        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                `Return Request Received - Shipment ${shipment.shipment_id}`,
                `
                    <h3>Hi ${order.user.name || ""},</h3>
                    <p>Your return request for Shipment #${shipment.shipment_id} has been received.</p>
                    <p>Reason: ${reason}</p>
                    <p>You can track the status in your account.</p>
                    <br/>
                    <p>Thank you,<br/>Joyory Team</p>
                `
            );
        }

        return res.status(201).json({
            success: true,
            message: "Shipment return request submitted successfully",
            returnId: returnEntry._id,
            data: returnEntry
        });

    } catch (err) {
        console.error("Return Request Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

// Get shipment returns by user
export const getMyShipmentReturns = async (req, res) => {
    try {
        const userId = req.user._id;

        // find orders where user has at least one shipment with returns
        const orders = await Order.find({ user: userId, "shipments.returns.0": { $exists: true } })
            .select("shipments createdAt")
            .sort({ createdAt: -1 });

        const flattened = [];
        for (const o of orders) {
            for (const s of o.shipments || []) {
                if (!s.returns?.length) continue;
                for (const r of s.returns) {
                    flattened.push({
                        shipmentCode: s.shipment_id,   // Shiprocket shipment id
                        shipmentId: s.shipment_id,     // kept for clarity (same as shipmentCode)
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


// Get shipment return details
export const getShipmentReturnDetails = async (req, res) => {
    try {
        const { shipment_id, returnId } = req.params;

        // shipment_id is a Shiprocket id (string) — do NOT validate it as ObjectId
        if (!returnId || !mongoose.Types.ObjectId.isValid(returnId)) {
            return res.status(400).json({ success: false, message: "Invalid returnId" });
        }

        const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user", "name email");
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        // Authorization: either owner user or admin allowed
        if (req.user && req.user._id) {
            if (order.user._id.toString() !== req.user._id.toString() && !(req.admin && req.admin._id)) {
                return res.status(403).json({ success: false, message: "Not authorized" });
            }
        }

        return res.json({
            success: true,
            data: {
                shipmentCode: shipment.shipment_id,
                return: ret
            }
        });
    } catch (err) {
        console.error("getShipmentReturnDetails Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// Cancel shipment return
export const cancelShipmentReturn = async (req, res) => {
    try {
        const userId = req.user._id;
        const { shipment_id, returnId } = req.params;

        if (!shipment_id) {
            return res.status(400).json({ success: false, message: "shipment_id is required" });
        }
        if (!returnId || !mongoose.Types.ObjectId.isValid(returnId)) {
            return res.status(400).json({ success: false, message: "Invalid returnId" });
        }

        // Find order by shipment.shipment_id
        const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        // Ownership check
        if (order.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not your shipment" });
        }

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        if (ret.overallStatus !== "requested" && ret.overallStatus !== "pending") {
            return res.status(400).json({ success: false, message: "Cannot cancel once processed" });
        }

        // Update only return subdocument
        ret.overallStatus = "cancelled";
        // Add timeline + audit entries (keeps forward timeline untouched)
        if (!ret.timeline) ret.timeline = [];
        if (!ret.auditTrail) ret.auditTrail = [];

        ret.timeline.push({
            status: "cancelled",
            timestamp: new Date(),
            location: "User",
            description: req.body?.notes || "User cancelled the return"
        });

        ret.auditTrail.push({
            status: "cancelled",
            action: "user_cancelled",
            performedBy: userId,
            performedByModel: "User",
            timestamp: new Date(),
            notes: req.body?.notes || "User cancelled the return"
        });

        await order.save();

        // Notify user
        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                `Return Cancelled - Shipment ${shipment.shipment_id}`,
                `<p>Your return request for Shipment #${shipment.shipment_id} has been cancelled successfully.</p>`
            );
        }

        return res.json({ success: true, message: "Return cancelled successfully" });
    } catch (err) {
        console.error("cancelShipmentReturn Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};


// ---------------------- ADMIN ENDPOINTS ----------------------

// Approve shipment return
// export const approveShipmentReturn = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;

//         // Fetch the order containing this shipment by shipment_id
//         const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         // Find shipment by shipment_id
//         const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
//         if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

//         // Find the return inside this shipment
//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         // Check if return is already processed
//         if (ret.overallStatus !== "requested") {
//             return res.status(400).json({ success: false, message: "Return already processed" });
//         }

//         // Create Shiprocket return order
//         let shiprocketResult;
//         try {
//             shiprocketResult = await createShiprocketReturnOrder(order, ret);
//         } catch (err) {
//             console.error("[Shiprocket Error]", err.message);
//             return res.status(422).json({
//                 success: false,
//                 message: "Failed to create Shiprocket return order",
//                 error: err.message
//             });
//         }

//         // Update return status & audit trail
//         ret.overallStatus = "approved";
//         ret.auditTrail.push({
//             status: "approved",
//             action: "admin_approved",
//             performedBy: req.admin?._id || null,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         // Notify user via email
//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 "✅ Your Return Request is Approved",
//                 `<p>Your return request for Shipment #${shipment.shipment_id} has been approved.</p>`
//             );
//         }

//         return res.json({
//             success: true,
//             message: "Return approved successfully",
//             shiprocket: shiprocketResult
//         });

//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Mark shipment return received and trigger refund
// export const markShipmentReturnReceived = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;

//         if (!isValidId(shipment_id) || !isValidId(returnId)) {
//             return res.status(400).json({ success: false, message: "Invalid shipment_id or returnId" });
//         }

//         const order = await Order.findOne({ "shipments._id": shipment_id });
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.id(shipment_id);
//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

//         if (["received_at_warehouse", "refunded"].includes(ret.overallStatus)) {
//             return res.status(400).json({ success: false, message: "Already received/refunded" });
//         }

//         ret.overallStatus = "received_at_warehouse";
//         ret.receivedAt = new Date();
//         ret.auditTrail.push({
//             status: "received_at_warehouse",
//             action: "admin_mark_received",
//             performedBy: req.admin._id,
//             performedByModel: "Admin",
//             timestamp: new Date(),
//             notes: req.body?.notes || "Marked received by admin",
//         });

//         await order.save();

//         await addRefundJob(order._id, { shipment_id: shipment._id, returnId: ret._id, amount: ret.refund?.amount || order.amount });

//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Received - Shipment ${shipment.shipment_id}`,
//                 `<p>Your returned item(s) for Shipment #${shipment.shipment_id} have been received. Refund will be processed shortly.</p>`
//             );
//         }

//         return res.json({ success: true, message: "Return received and refund triggered" });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// // Reject shipment return
// export const rejectShipmentReturn = async (req, res) => {
//     try {
//         const { shipment_id, returnId } = req.params;
//         const { reason } = req.body;

//         if (!isValidId(shipment_id) || !isValidId(returnId)) {
//             return res.status(400).json({ success: false, message: "Invalid shipment_id or returnId" });
//         }

//         const order = await Order.findOne({ "shipments._id": shipment_id }).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

//         const shipment = order.shipments.id(shipment_id);
//         const ret = shipment.returns.id(returnId);
//         if (!ret) return res.status(404).json({ success: false, message: "Return not found" });
//         if (ret.overallStatus !== "requested") return res.status(400).json({ success: false, message: "Already processed" });

//         ret.overallStatus = "rejected";
//         ret.adminRejectionReason = reason;
//         ret.auditTrail.push({
//             status: "rejected",
//             action: "admin_rejected",
//             notes: reason,
//             performedBy: req.admin?._id || null,
//             performedByModel: "Admin",
//             timestamp: new Date()
//         });

//         await order.save();

//         if (order.user?.email) {
//             await sendEmail(
//                 order.user.email,
//                 `Return Rejected - Shipment ${shipment.shipment_id}`,
//                 `<p>Your return request for Shipment #${shipment.shipment_id} has been rejected.</p><p>Reason: ${reason}</p>`
//             );
//         }

//         return res.json({ success: true, message: "Return rejected and user notified" });
//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };



export const approveShipmentReturn = async (req, res) => {
    try {
        const { shipment_id, returnId } = req.params;

        const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        if (ret.overallStatus !== "requested") {
            return res.status(400).json({ success: false, message: "Return already processed" });
        }

        // Create Shiprocket return order safely
        let shiprocketResult;
        try {
            shiprocketResult = await createShiprocketReturnOrder(order, ret);
        } catch (err) {
            console.error("[Shiprocket Error]", err.message);
            return res.status(422).json({
                success: false,
                message: "Failed to create Shiprocket return order",
                error: err.message
            });
        }

        // Update return status & auditTrail
        ret.overallStatus = "approved";
        if (!ret.auditTrail) ret.auditTrail = [];
        ret.auditTrail.push({
            status: "approved",
            action: "admin_approved",
            performedBy: req.admin?._id || null,
            performedByModel: "Admin",
            timestamp: new Date()
        });

        await order.save();

        // Notify user
        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                "✅ Your Return Request is Approved",
                `<p>Your return request for Shipment #${shipment.shipment_id} has been approved.</p>`
            );
        }

        return res.json({
            success: true,
            message: "Return approved successfully",
            shiprocket: shiprocketResult
        });

    } catch (err) {
        console.error("approveShipmentReturn Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const markShipmentReturnReceived = async (req, res) => {
    try {
        const { shipment_id, returnId } = req.params;

        if (!returnId || !mongoose.Types.ObjectId.isValid(returnId)) {
            return res.status(400).json({ success: false, message: "Invalid returnId" });
        }

        const order = await Order.findOne({ "shipments.shipment_id": shipment_id });
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });

        if (["received_at_warehouse", "refunded"].includes(ret.overallStatus)) {
            return res.status(400).json({ success: false, message: "Already received/refunded" });
        }

        ret.overallStatus = "received_at_warehouse";
        ret.receivedAt = new Date();
        if (!ret.auditTrail) ret.auditTrail = [];
        if (!ret.timeline) ret.timeline = [];

        ret.auditTrail.push({
            status: "received_at_warehouse",
            action: "admin_mark_received",
            performedBy: req.admin._id,
            performedByModel: "Admin",
            timestamp: new Date(),
            notes: req.body?.notes || "Marked received by admin"
        });

        ret.timeline.push({
            status: "received_at_warehouse",
            timestamp: new Date(),
            location: "Warehouse",
            description: req.body?.notes || "Return received at warehouse"
        });

        await order.save();

        await addRefundJob(order._id, {
            shipment_id: shipment.shipment_id,
            returnId: ret._id,
            amount: ret.refund?.amount || order.amount
        });

        if (order.user?.email) {
            await sendEmail(
                order.user.email,
                `Return Received - Shipment ${shipment.shipment_id}`,
                `<p>Your returned item(s) for Shipment #${shipment.shipment_id} have been received. Refund will be processed shortly.</p>`
            );
        }

        return res.json({ success: true, message: "Return received and refund triggered" });
    } catch (err) {
        console.error("markShipmentReturnReceived Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const rejectShipmentReturn = async (req, res) => {
    try {
        const { shipment_id, returnId } = req.params;
        const { reason } = req.body;

        if (!returnId || !mongoose.Types.ObjectId.isValid(returnId)) {
            return res.status(400).json({ success: false, message: "Invalid returnId" });
        }

        const order = await Order.findOne({ "shipments.shipment_id": shipment_id }).populate("user");
        if (!order) return res.status(404).json({ success: false, message: "Shipment not found" });

        const shipment = order.shipments.find(s => s.shipment_id === shipment_id);
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });

        const ret = shipment.returns.id(returnId);
        if (!ret) return res.status(404).json({ success: false, message: "Return not found" });
        if (ret.overallStatus !== "requested") return res.status(400).json({ success: false, message: "Already processed" });

        ret.overallStatus = "rejected";
        ret.adminRejectionReason = reason;

        if (!ret.auditTrail) ret.auditTrail = [];
        if (!ret.timeline) ret.timeline = [];

        ret.auditTrail.push({
            status: "rejected",
            action: "admin_rejected",
            notes: reason,
            performedBy: req.admin?._id || null,
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
                `Return Rejected - Shipment ${shipment.shipment_id}`,
                `<p>Your return request for Shipment #${shipment.shipment_id} has been rejected.</p><p>Reason: ${reason}</p>`
            );
        }

        return res.json({ success: true, message: "Return rejected and user notified" });
    } catch (err) {
        console.error("rejectShipmentReturn Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
