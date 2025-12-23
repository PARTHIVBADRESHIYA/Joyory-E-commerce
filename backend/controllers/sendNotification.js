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
