import NotificationSetting from '../../../models/settings/admin/AdminNotifications.js';
import { sendEmail, sendSMS } from '../../../middlewares/utils/sendNotification.js';

export const updateNotification = async (req, res) => {
    try {
        const adminId = req.user.id; // comes from JWT middleware
        const adminType = req.user.type || 'AdminRoleAdmin'; // ⬅️ fallback


        const { email, phone } = req.body;

        let settings = await NotificationSetting.findOne({ adminId });

        if (settings) {
            // Update existing
            settings.email = email;
            settings.phone = phone;
            await settings.save();
        } else {
            // Create new
            settings = new NotificationSetting({ adminId, adminType,email, phone });
            await settings.save();
        }

        res.status(200).json({ message: "Notification preferences updated." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong while saving settings." });
    }
};

export const testNotification = async (req, res) => {
    const { type, channel } = req.body;
    const admin = req.user;

    let logInfo = "";

    if (channel === 'email') {
        logInfo = `[EMAIL] To: ${admin.email} | Type: ${type}`;
        await sendEmail(admin, type);
    } else if (channel === 'phone') {
        logInfo = `[SMS] To: ${admin.phone} | Type: ${type}`;
        await sendSMS(admin.phone, type);
    }

    res.json({
        message: `Test ${channel} notification sent for ${type}`,
        debug: logInfo
    });
};
