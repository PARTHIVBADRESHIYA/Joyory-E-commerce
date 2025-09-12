// routes/sellerAuthRoutes.js
import express from "express";
import {
    sellerLogin,
    sellerSendOtp,
    sellerResetPasswordWithOtp
} from "../controllers/sellerAuthController.js";

const router = express.Router();

// Seller login
router.post("/login", sellerLogin);

// Send OTP for password reset
router.post("/forgot-password", sellerSendOtp);

// Reset password using OTP
router.post("/reset-password", sellerResetPasswordWithOtp);

export default router;
