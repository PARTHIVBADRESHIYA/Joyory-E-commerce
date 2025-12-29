// routes/user/userAnalyticsRoutes.js
import express from "express";
import {
  getCustomerAnalytics,
  getAllCustomerAnalytics
} from "../../controllers/user/userAnalyticsController.js";

import { isAdmin } from "../../middlewares/authMiddleware.js";
const router = express.Router();

router.get("/all", isAdmin, getAllCustomerAnalytics);
// /api/brands
router.get("/:userId", isAdmin, getCustomerAnalytics);

export default router;
