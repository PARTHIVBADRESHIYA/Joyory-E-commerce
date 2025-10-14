import express from "express";
import { isAdmin } from "../middlewares/authMiddleware.js";
import {
    getReferralConfig,
    upsertReferralConfig,
} from "../controllers/adminReferralConfigController.js";

const router = express.Router();

router.get("/", isAdmin, getReferralConfig);
router.put("/", isAdmin, upsertReferralConfig);

export default router;
