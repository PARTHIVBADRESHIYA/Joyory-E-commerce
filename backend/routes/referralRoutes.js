import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getReferralCode, getReferralHistory } from "../controllers/referralController.js";

const router = express.Router();

// Get my referral code
router.get("/code", protect, getReferralCode);

// Get my referral history (who signed up using my code)
router.get("/history", protect, getReferralHistory);

export default router;
