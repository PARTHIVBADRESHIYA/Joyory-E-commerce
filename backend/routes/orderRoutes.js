import express from 'express';
import { adminListOrders,adminConfirmOrder, adminCancelOrder, getAllOrders, getOrderSummary, getOrderById, updateOrderStatus, retryFailedShipments, adminApproveRefund, getAllRefundRequests, adminRejectRefund } from '../controllers/orderController.js';
import { isAdmin } from '../middlewares/authMiddleware.js';


const router = express.Router();

router.get('/admin/orders', isAdmin, adminListOrders);  
router.put('/admin/orders/:id/confirm', isAdmin, adminConfirmOrder);
router.put('/admin/orders/:id/cancel', isAdmin, adminCancelOrder);

router.get('/refund-requests', isAdmin, getAllRefundRequests);
router.post('/reject-refund', isAdmin, adminRejectRefund);
router.post('/approve-refund', isAdmin, adminApproveRefund);
router.get('/', isAdmin, getAllOrders);
router.get('/summary', isAdmin, getOrderSummary);
router.post('/retry', isAdmin, retryFailedShipments);
router.get("/:id", isAdmin, getOrderById);  // view details of one order
router.put("/:id/status", isAdmin, updateOrderStatus);


export default router;
