// import express from "express";
// import {
//     affiliateSignup,
//     affiliateLogin,
//     createAffiliateLink,
//     getMyAffiliateLinks,
//     trackClick,
//     getAffiliateStats,
//     getAffiliateOrders,
//     getPayouts,
//     getPendingCommissions,
//     approveCommission,
//     rejectCommission,
//     payAffiliate,
//     getPayoutHistory,
//     adminAffiliateSummary
// } from "../controllers/affiliateController.js";
// import { affiliateAuth ,isAdmin} from "../middlewares/authMiddleware.js";

// const router = express.Router();

// // Auth
// router.post("/signup", affiliateSignup);
// router.post("/login", affiliateLogin);

// // Protected Routes
// router.get("/orders", affiliateAuth, getAffiliateOrders);
// router.get("/payouts", affiliateAuth, getPayouts);

// router.get("/commissions/pending", isAdmin, getPendingCommissions);
// router.post("/commissions/approve", isAdmin, approveCommission);
// router.post("/commissions/reject", isAdmin, rejectCommission);

// router.post("/pay", isAdmin, payAffiliate);

// router.get("/payouts", isAdmin, getPayoutHistory);

// router.get("/summary", isAdmin, adminAffiliateSummary);

// // Protected Routes
// router.post("/create-link", affiliateAuth, createAffiliateLink);
// router.get("/my-links", affiliateAuth, getMyAffiliateLinks);
// router.get("/stats", affiliateAuth, getAffiliateStats);

// // Public Link Redirect
// router.get("/aff/:slug", trackClick);

// export default router;





































import express from "express";
import {
   affiliateSignup,
   affiliateLogin,

   createAffiliateLink,
   quickCreateAffiliateLink,
   getMyAffiliateLinks,
   trackClick,

   getAffiliateStats,
   getAffiliateOrders,
   getAffiliateEarnings,
   getAffiliatePayouts,

   // admin
   adminGetUsers,
   adminGetUserDetails,
   adminGetCommissions,
   adminApproveCommission,
   adminRejectCommission,
   adminPayAffiliate,
   adminGetPayoutHistory,
   adminAffiliateSummary,
   adminCreateCommissionPayoutOrder,
   verifyAffiliateCommissionPayment
} from "../controllers/affiliateController.js";

import { affiliateAuth, isAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

/* ----------------------------------
   AFFILIATE USER AUTH
---------------------------------- */
router.post("/signup", affiliateSignup);
router.post("/login", affiliateLogin);

/* ----------------------------------
   AFFILIATE LINK MANAGEMENT
---------------------------------- */
router.post("/create-link", affiliateAuth, createAffiliateLink);
router.post("/quick-link", affiliateAuth, quickCreateAffiliateLink);
router.get("/my-links", affiliateAuth, getMyAffiliateLinks);

/* Public redirect */
router.get("/aff/:slug", trackClick);

/* ----------------------------------
   AFFILIATE DASHBOARD
---------------------------------- */
router.get("/stats", affiliateAuth, getAffiliateStats);
router.get("/orders", affiliateAuth, getAffiliateOrders);
router.get("/earnings", affiliateAuth, getAffiliateEarnings);
router.get("/payouts", affiliateAuth, getAffiliatePayouts);

/* ----------------------------------
   ADMIN PANEL ROUTES
---------------------------------- */
// Users
router.get("/admin/users", isAdmin, adminGetUsers);
router.get("/admin/users/:id", isAdmin, adminGetUserDetails);

// Commissions
router.get("/admin/commissions", isAdmin, adminGetCommissions);
router.post("/admin/commissions/approve", isAdmin, adminApproveCommission);
router.post("/admin/commissions/reject", isAdmin, adminRejectCommission);

// Payouts
router.post("/admin/pay", isAdmin, adminPayAffiliate);
router.post("/admin/commissions/pay", isAdmin, adminCreateCommissionPayoutOrder);
router.post("/admin/commissions/verify", isAdmin, verifyAffiliateCommissionPayment);
router.get("/admin/payouts", isAdmin, adminGetPayoutHistory);

// Summary Dashboard
router.get("/admin/summary", isAdmin, adminAffiliateSummary);

export default router;
