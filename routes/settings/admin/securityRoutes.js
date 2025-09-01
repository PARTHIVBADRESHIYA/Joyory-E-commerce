// routes/securityRoutes.js
import express from 'express';
import { sendOtpToUser, resetPasswordWithOtp,loginWithOtp ,verifyEmailOtp ,sendOtpToAdmin,adminLoginWithOtp,verifyAdminEmailOtp,resetAdminPasswordWithOtp} from '../../../controllers/otpResetController.js';
import { otpLimiter } from "../../../middlewares/security/rateLimiter.js";

import { resetPasswordWithOtpSchema } from "../../../middlewares/validations/otpValidation.js";
import { validate } from "../../../middlewares/validations/validate.js";


const router = express.Router();

router.post('/send-otp', otpLimiter,sendOtpToUser)
router.post('/verify-otp', verifyEmailOtp);
router.post('/reset-password', resetPasswordWithOtp);
router.post('/login-otp', loginWithOtp);



router.post('/admin/send-otp', sendOtpToAdmin);
router.post('/admin/login-otp', adminLoginWithOtp);
router.post('/admin/verify-otp', verifyAdminEmailOtp);
router.post('/admin/reset-password', validate (resetPasswordWithOtpSchema), resetAdminPasswordWithOtp);


export default router;

