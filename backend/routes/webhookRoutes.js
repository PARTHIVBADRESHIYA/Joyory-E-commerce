// routes/webhookRoutes.js
import express from "express";
import { shiprocketWebhook , razorpayWebhook} from "../controllers/webhookController.js";

const router = express.Router();

// Shiprocket will call this URL
router.post("/shiprocket", shiprocketWebhook);

// Razorpay will call this URL
router.post("/razorpay/webhook", razorpayWebhook);

export default router;
