import express from "express";
import {
    getAllNotifications,
    markNotificationRead,
    markAllNotificationsRead
} from "../controllers/sendNotification.js";

import { isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// GET all notifications
router.get("/",isAdmin, getAllNotifications);

// Mark single notification as read
router.patch("/:id/read",isAdmin, markNotificationRead);

// Mark all as read
router.patch("/mark-all",isAdmin, markAllNotificationsRead);

export default router;
