import express from "express";
import { getHomepageSections } from "../../controllers/user/recommendationController.js";
import { trackProductView } from "../../controllers/user/userController.js";
import { authenticateUser, optionalAuth } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// Full homepage with multiple sections
router.get("/personalized", optionalAuth, getHomepageSections);

// Track product views for personalization
router.post("/track-view", authenticateUser, trackProductView);

export default router;
