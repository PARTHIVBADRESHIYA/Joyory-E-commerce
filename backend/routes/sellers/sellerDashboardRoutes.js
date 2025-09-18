// routes/sellerDashboardRoutes.js
import express from "express";
import { authenticateSeller } from "../../middlewares/authMiddleware.js";
import { getSellerDashboard } from "../../controllers/sellers/sellerDashboardController.js";

const router = express.Router();
router.get("/", authenticateSeller, getSellerDashboard);
export default router;
