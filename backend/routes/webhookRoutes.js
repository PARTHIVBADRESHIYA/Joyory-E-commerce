// routes/webhookRoutes.js
import express from "express";
import { razorpayWebhook } from "../controllers/webhookController.js";

const router = express.Router();

// Razorpay will call this URL
router.post("/razorpay/webhook", razorpayWebhook);

export default router;
