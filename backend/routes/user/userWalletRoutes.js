// import express from "express";
// import { protect } from "../../middlewares/authMiddleware.js";
// import {
//     getWallet,
//     addMoney,
//     redeemPoints,
//     refundToWallet,
// } from "../../controllers/user/userWalletController.js";

// const router = express.Router();
// router.get("/", protect, getWallet);
// router.post("/add-money", protect, addMoney);
// router.post("/redeem", protect, redeemPoints);
// // refundToWallet typically used by admin/service (protect + adminOnly middleware)
// router.post("/refund", protect, refundToWallet);

// export default router;










import express from "express";
import { protect } from "../../middlewares/authMiddleware.js";
import {
    getWallet,
    createWalletOrder,
    verifyWalletPayment,
    redeemPoints,
    refundToWallet,
    addRewardPoints, // optional if you want a separate endpoint
} from "../../controllers/user/userWalletController.js";

const router = express.Router();

// ✅ Get wallet details
router.get("/", protect, getWallet);

// ================== RAZORPAY WALLET FLOW ================== //
// Step 1: create wallet order
router.post("/create-order", protect, createWalletOrder);

// Step 2: verify payment and credit wallet
router.post("/verify-payment", protect, verifyWalletPayment);

// ================== EXISTING FEATURES ================== //
// Redeem points
router.post("/redeem", protect, redeemPoints);

// Refund (admin/service only)
router.post("/refund", protect, refundToWallet);

// Optional: Add reward points (can also be admin triggered)
router.post("/add-reward", protect, addRewardPoints);

export default router;
