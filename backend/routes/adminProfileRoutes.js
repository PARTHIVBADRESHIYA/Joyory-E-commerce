import express from "express";
import { isAdmin } from "../middlewares/authMiddleware.js";
import {
    getReferralConfig,
    upsertReferralConfig,
    createReferralCampaign
    
} from "../controllers/adminReferralConfigController.js";

const router = express.Router();

router.get("/", isAdmin, getReferralConfig);
router.put("/", isAdmin, upsertReferralConfig);
router.post("/campaign", isAdmin, createReferralCampaign);

export default router;
