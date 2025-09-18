// routes/sellers/sellerOrderRoutes.js
import express from "express";
import { authenticateSeller } from "../../middlewares/authMiddleware.js";
import {
    listSellerOrders,
    getSellerOrderById,
    shipSellerOrder,
    updateSellerOrderStatus,
    getSellerOrderSummary,
    getTopSellingProducts
} from "../../controllers/sellers/sellerOrderController.js";

const router = express.Router();

/* ================= Seller Orders ================= */

// List all orders for seller with pagination & filters
router.get("/", authenticateSeller, listSellerOrders);

// Get single order details (seller view)
router.get("/:id", authenticateSeller, getSellerOrderById);

// Mark a seller's split order as shipped
router.post("/:orderId/ship", authenticateSeller, shipSellerOrder);

// Update a seller's split order status (e.g., Delivered, Cancelled)
router.put("/:orderId/status", authenticateSeller, updateSellerOrderStatus);

// Seller dashboard summary metrics (total, new, shipped, pending)
router.get("/dashboard/summary", authenticateSeller, getSellerOrderSummary);

// Seller dashboard latest feature: top-selling products
router.get("/dashboard/top-products", authenticateSeller, getTopSellingProducts);

export default router;
