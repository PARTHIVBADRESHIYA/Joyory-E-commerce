// routes/sellers/sellerPayoutRoutes.js
import express from "express";
import { authenticateSeller } from "../../middlewares/authMiddleware.js";
import {
    getPayouts,
    requestPayout
} from "../../controllers/sellers/sellerPayoutController.js";

const router = express.Router();

/* ================= Seller Payouts ================= */
router.get("/", authenticateSeller, getPayouts);
router.post("/request", authenticateSeller, requestPayout);

export default router;
