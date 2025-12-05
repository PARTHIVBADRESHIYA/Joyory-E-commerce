import express from "express";
import {
    affiliateSignup,
    affiliateLogin,
    createAffiliateLink,
    getMyAffiliateLinks,
    trackClick,
    getAffiliateStats,
    getAffiliateOrders,
    getPayouts,
    markCommissionPaid,
    getPendingCommissions,
    approveCommission,
    rejectCommission,
    payAffiliate,
    getPayoutHistory,
    adminAffiliateSummary
} from "../controllers/affiliateController.js";
import { affiliateAuth ,isAdmin} from "../middlewares/authMiddleware.js";

const router = express.Router();

// Auth
router.post("/signup", affiliateSignup);
router.post("/login", affiliateLogin);

// Protected Routes
router.get("/orders", affiliateAuth, getAffiliateOrders);
router.get("/payouts", affiliateAuth, getPayouts);
router.put("/mark-paid", affiliateAuth, markCommissionPaid);

router.get("/commissions/pending", isAdmin, getPendingCommissions);
router.post("/commissions/approve", isAdmin, approveCommission);
router.post("/commissions/reject", isAdmin, rejectCommission);

router.post("/pay", isAdmin, payAffiliate);

router.get("/payouts", isAdmin, getPayoutHistory);

router.get("/summary", isAdmin, adminAffiliateSummary);

// Protected Routes
router.post("/create-link", affiliateAuth, createAffiliateLink);
router.get("/my-links", affiliateAuth, getMyAffiliateLinks);
router.get("/stats", affiliateAuth, getAffiliateStats);

// Public Link Redirect
router.get("/aff/:slug", trackClick);

export default router;
