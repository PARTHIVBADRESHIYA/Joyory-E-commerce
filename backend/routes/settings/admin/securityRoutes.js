// routes/securityRoutes.js
import express from 'express';
import { sendOtpToUser, resetPasswordWithOtp,loginWithOtp ,verifyEmailOtp } from '../../../controllers/otpResetController.js';
import { otpLimiter } from "../../../middlewares/security/rateLimiter.js";


const router = express.Router();

router.post('/send-otp', otpLimiter,sendOtpToUser)
router.post('/verify-otp', verifyEmailOtp);
router.post('/reset-password', resetPasswordWithOtp);
router.post('/login-otp', loginWithOtp);

export default router;

