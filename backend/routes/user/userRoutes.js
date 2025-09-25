// routes/authRoutes.js

import express from 'express';
import { userSignup, userLogin,logoutUser,deleteAccount } from "../../controllers/user/userController.js";
import { addToWishlist, removeFromWishlist, getWishlist, moveToCart } from "../../controllers/user/profile/wishlistController.js";
import { userLoginSchema, userSignupSchema } from '../../middlewares/validations/userValidation.js';
import { validate } from '../../middlewares/validations/validate.js';
import { protect } from '../../middlewares/authMiddleware.js';
import { userLoginLimiter } from '../../middlewares/security/rateLimiter.js';

const router = express.Router();

// ✅ Public user routes (no IP lock)
router.post('/signup', validate(userSignupSchema), userSignup);
router.post('/login', userLoginLimiter, validate(userLoginSchema), userLogin);
router.post('/logout', logoutUser);
router.delete('/delete-account', protect, deleteAccount);

// 🛒 Wishlist
router.post("/wishlist/:productId", protect, addToWishlist);
router.delete("/wishlist/:productId", protect, removeFromWishlist);
router.get("/wishlist", protect, getWishlist);
router.post("/wishlist/:productId/move-to-cart", protect, moveToCart);

export default router;
