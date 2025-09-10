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

// routes/devRoutes.js (or integrate into admin router)
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import { generateInvoice } from "../../middlewares/services/invoiceService.js";


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




// WARNING: Protect this route in prod
router.get("/dev/generate-invoice/:orderId", async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate("user")
            .populate("products.productId")
            .lean(); // or not .lean() if you want mongoose document
        if (!order) return res.status(404).json({ ok: false, message: "Order not found" });

        // ensure user is present
        const user = order.user || (await User.findById(order.user));
        if (!user) return res.status(404).json({ ok: false, message: "User not found" });

        const { pdfUrl } = await generateInvoice(order, user);

        // save invoice to order (persist)
        await Order.findByIdAndUpdate(order._id, {
            $set: {
                invoice: {
                    number: `INV-${order.orderNumber || order.orderId || order._id}`,
                    pdfUrl,
                    generatedAt: new Date(),
                },
            },
        });

        return res.json({ ok: true, pdfUrl });
    } catch (err) {
        console.error("dev/generate-invoice error:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});


export default router;
