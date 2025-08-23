// routes/recommendationRoutes.js
import express from "express";
import { getPersonalizedRecommendations } from "../../controllers/user/recommendationController.js";
import {trackProductView} from "../../controllers/user/userController.js";
import {authenticateUser,optionalAuth} from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/personalized",optionalAuth, getPersonalizedRecommendations);

router.post("/track-view",authenticateUser, trackProductView);

export default router;

