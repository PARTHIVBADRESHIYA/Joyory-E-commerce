import express from "express";
import {
    getAnalyticsDashboard,getFullDashboard
} from "../controllers/analyticsController.js";
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get("/admin/analytics",verifyAdminOrTeamMember, getAnalyticsDashboard);
router.get("/admin/dashboard",verifyAdminOrTeamMember, getFullDashboard);

export default router;
