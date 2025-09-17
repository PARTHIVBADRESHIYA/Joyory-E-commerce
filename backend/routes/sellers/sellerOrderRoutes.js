// routes/sellers/sellerOrderRoutes.js
import express from "express";
import { authenticateSeller } from "../../middlewares/authMiddleware.js";
import {
    listSellerOrders,
    shipOrder
} from "../../controllers/sellers/sellerOrderController.js";

const router = express.Router();

/* ================= Seller Orders ================= */
router.get("/", authenticateSeller, listSellerOrders);
router.post("/:orderId/ship", authenticateSeller, shipOrder);

export default router;
