// routes/authRoutes.js

import express from 'express';
import { userSignup, userLogin } from "../../controllers/user/userController.js";
import { userLoginSchema, userSignupSchema } from '../../middlewares/validations/userValidation.js';
import { validate } from '../../middlewares/validations/validate.js';
import { userLoginLimiter } from '../../middlewares/security/rateLimiter.js';

const router = express.Router();

// ✅ Public user routes (no IP lock)
router.post('/signup', validate(userSignupSchema), userSignup);
router.post('/login', userLoginLimiter, validate(userLoginSchema), userLogin);

export default router;
