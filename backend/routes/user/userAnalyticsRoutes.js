// routes/user/userAnalyticsRoutes.js
import express from "express";
import {
  getCustomerAnalytics,
  getAllCustomerAnalytics
} from "../../controllers/user/userAnalyticsController.js";

import {getUserActivitiesByUser,getAllUserActivities,getActivitiesByType } from "../../controllers/user/userActivityController.js";

import { isAdmin } from "../../middlewares/authMiddleware.js";
const router = express.Router();

router.get("/all", isAdmin, getAllCustomerAnalytics);
// /api/brands
router.get("/:userId", isAdmin, getCustomerAnalytics);

router.get("/activities/all", isAdmin, getAllUserActivities);
router.get("/activities/:type", isAdmin, getActivitiesByType);  
router.get("/activities/:userId", isAdmin, getUserActivitiesByUser);

export default router;
