import express from 'express';
import { adminListOrders, adminConfirmOrder, adminCancelOrder, getAllOrders, getAdminOrderTracking, getOrderSummary, getOrderById, updateOrderStatus, retryFailedShipments, adminApproveRefund, getAllRefundRequests, adminRejectRefund } from '../controllers/orderController.js';
import { isAdmin } from '../middlewares/authMiddleware.js';
import { checkPermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/admin/orders', isAdmin, checkPermission('orders:view'),
    adminListOrders);
router.put('/admin/orders/:id/confirm', checkPermission('orders:update'),
    isAdmin, adminConfirmOrder);
router.put('/admin/orders/:id/cancel', isAdmin, checkPermission('orders:cancel'),
    adminCancelOrder);
router.get('/refund-requests', isAdmin, checkPermission('orders:refund'),
    getAllRefundRequests);
router.post('/reject-refund', isAdmin, checkPermission('orders:refund'),
    adminRejectRefund);
router.post('/approve-refund', isAdmin, checkPermission('orders:refund'),
    adminApproveRefund);


router.get('/', isAdmin, checkPermission('orders:view'), // permission defined in role
    getAllOrders);
router.get('/summary', isAdmin, checkPermission('orders:view'),
    getOrderSummary);
router.post('/retry', isAdmin, checkPermission('orders:update'),
    retryFailedShipments);
router.get("/:id", isAdmin, checkPermission('orders:view'),
    getOrderById);  // view details of one order
router.get("/:id/tracking", isAdmin, checkPermission('orders:view'),
    getAdminOrderTracking);
router.put("/:id/status", isAdmin, checkPermission('orders:update'),
    updateOrderStatus);


export default router;
