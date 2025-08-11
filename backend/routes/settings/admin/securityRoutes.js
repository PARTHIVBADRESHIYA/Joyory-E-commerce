// routes/securityRoutes.js
import express from 'express';
import { sendOtpToUser, resetPasswordWithOtp,loginWithOtp ,verifyEmailOtp } from '../../../controllers/otpResetController.js';
import { otpLimiter } from "../../../middlewares/security/rateLimiter.js";


const router = express.Router();

router.post('/send-otp', otpLimiter,sendOtpToUser);
router.post('/reset-password', resetPasswordWithOtp);
// routes/auth.js
router.post('/login-otp', loginWithOtp);

router.post('/verify-otp', verifyEmailOtp);

export default router;

