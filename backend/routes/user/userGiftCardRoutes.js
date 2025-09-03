// routes/user/userGiftCardRoutes.js
import express from "express";
import {
    purchaseGiftCard,
    redeemGiftCard,
    checkGiftCardBalance,
    getMyGiftCards
} from "../../controllers/user/userGiftCardController.js";
import { protect } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// Buy gift card (after payment success)
router.post("/purchase", protect, purchaseGiftCard);

// Redeem at checkout
router.post("/redeem", protect, redeemGiftCard);

// Check balance
router.get("/balance/:code/:pin", protect, checkGiftCardBalance);

// User’s gift cards
router.get("/my", protect, getMyGiftCards);

export default router;
