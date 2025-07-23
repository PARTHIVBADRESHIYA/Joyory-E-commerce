import NotificationSetting from '../../../models/settings/admin/AdminNotifications.js';
import { sendEmail, sendSMS } from '../../../middlewares/utils/sendNotification.js';

export const updateNotification = async (req, res) => {
    try {
        const adminId = req.user.id; // comes from JWT middleware

        const { email, phone } = req.body;

        let settings = await NotificationSetting.findOne({ adminId });

        if (settings) {
            // Update existing
            settings.email = email;
            settings.phone = phone;
            await settings.save();
        } else {
            // Create new
            settings = new NotificationSetting({ adminId, email, phone });
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

    if (channel === 'email') {
        await sendEmail(admin, type);
    } else if (channel === 'phone') {
        await sendSMS(admin.phone, type);
    }

    res.json({ message: `Test ${channel} notification sent for ${type}` });
};
