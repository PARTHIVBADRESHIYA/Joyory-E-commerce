import express from "express";
import { isAdmin } from "../middlewares/authMiddleware.js";
import {
    getReferralConfig,
    upsertReferralConfig,
    createReferralCampaign,
    getReferralConfigCampaigns,
    upsertReferralConfigCampaign,
    getReferralConfigCampaignById

} from "../controllers/adminReferralConfigController.js";

const router = express.Router();

router.get("/", isAdmin, getReferralConfig);
router.put("/", isAdmin, upsertReferralConfig);
router.post("/campaign", isAdmin, createReferralCampaign);
router.get("/campaign", isAdmin, getReferralConfigCampaigns);
router.get("/campaign/:id", isAdmin, getReferralConfigCampaignById);
router.put("/campaign/:id", isAdmin, upsertReferralConfigCampaign);

export default router;
