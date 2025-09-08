import express from "express";
import {
    getAnalyticsDashboard, getCustomerVolumeAnalytics,
    getCustomerBehaviorAnalytics
} from "../controllers/analyticsController.js";
import { authenticateUser, verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get("/admin/analytics", getAnalyticsDashboard);

router.get('/dashboard/customer-insights', verifyAdminOrTeamMember, async (req, res) => {
    try {
        const volume = await getCustomerVolumeAnalytics();
        const behavior = await getCustomerBehaviorAnalytics();

        res.status(200).json({
            customerVolume: volume,
            customerBehavior: behavior,
        });
    } catch (err) {
        console.error('Customer analytics error:', err);
        res.status(500).json({ message: 'Failed to load customer insights', error: err.message });
    }
});
export default router;
