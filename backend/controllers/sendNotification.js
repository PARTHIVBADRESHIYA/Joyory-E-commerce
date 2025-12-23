import Notification from "../models/Notifications.js";
import { io } from "../server.js";

export const sendNotification = async ({ type, message, priority, meta }) => {
    const notification = await Notification.create({
        type,
        message,
        priority,
        meta
    });

    // Emit to all admins
    io.emit("admin-notification", notification);

    return notification;
};



// GET ALL NOTIFICATIONS (with filters)
export const getAllNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20, unreadOnly } = req.query;

        const filter = {};
        if (unreadOnly === "true") {
            filter.isRead = false;
        }

        const notifications = await Notification.find(filter)
            .sort({ createdAt: -1 }) // newest first
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Notification.countDocuments(filter);

        res.json({
            success: true,
            total,
            page: Number(page),
            limit: Number(limit),
            notifications
        });
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};


export const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;

        const updated = await Notification.findByIdAndUpdate(
            id,
            { isRead: true },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.json({ success: true, notification: updated });
    } catch (err) {
        console.error("Error marking notification read:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

export const markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany({}, { isRead: true });

        res.json({ success: true, message: "All notifications marked as read" });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
