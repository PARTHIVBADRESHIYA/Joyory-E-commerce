import express from "express";
import {
    getAnalyticsDashboard
} from "../controllers/analyticsController.js";
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get("/admin/analytics",verifyAdminOrTeamMember, getAnalyticsDashboard);

export default router;
