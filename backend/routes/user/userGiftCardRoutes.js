

// // routes/user/userGiftCardRoutes.js
// import express from "express";
// import {
//     createGiftCardOrder,
//     verifyGiftCardPayment,
//     redeemGiftCard,
//     checkGiftCardBalance,
//     getMyGiftCards
// } from "../../controllers/user/userGiftCardController.js";
// import { protect } from "../../middlewares/authMiddleware.js";

// const router = express.Router();

// // 🟢 Step 1: Create Razorpay order for gift card
// router.post("/create-order", protect, createGiftCardOrder);

// // 🟢 Step 2: Verify payment & issue gift card
// router.post("/verify-payment", protect, verifyGiftCardPayment);

// // 🟢 Redeem at checkout
// router.post("/redeem", protect, redeemGiftCard);

// // 🟢 Check balance
// router.get("/balance/:code/:pin", protect, checkGiftCardBalance);

// // 🟢 Get logged-in user’s gift cards
// router.get("/my", protect, getMyGiftCards);

// export default router;










import express from "express";
import {
    createGiftCardOrder,
    verifyGiftCardPayment,
    redeemGiftCard,
    checkGiftCardBalance,
    getMyGiftCardsList,
    getGiftCardDetails,
    getAllGiftCardTemplates
} from "../../controllers/user/userGiftCardController.js";
import { protect } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// Step 1: Create Razorpay order
router.post("/create-order", protect, createGiftCardOrder);

// Step 2: Verify payment & issue card
router.post("/verify-payment", protect, verifyGiftCardPayment);

// Redeem card
router.post("/redeem", protect, redeemGiftCard);

// Check balance
router.get("/balance/:code/:pin", protect, checkGiftCardBalance);

// My sent gift cards
router.get("/list", protect, getMyGiftCardsList); // minimal list view
router.get("/details/:id", protect, getGiftCardDetails); // full detail view by id

// Get all gift card templates
router.get("/templates", getAllGiftCardTemplates);

export default router;
