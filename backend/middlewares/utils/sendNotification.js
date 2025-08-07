// middlewares/utils/sendNotification.js
import { sendEmail as sendMailtrap } from './emailService.js';

export const sendEmail = async (admin, type) => {
    const subject = `[Notification] ${type} alert`;
    const html = `
        <p>Hi ${admin.name || 'Admin'},</p>
        <p>This is a test notification for <strong>${type}</strong>.</p>
        <p>Thank you,<br/>Joyory Team</p>
    `;
    await sendMailtrap(admin.email, subject, html);
};

export const sendSMS = async (phone, type) => {
    console.log(`[SMS] To: ${phone} | Type: ${type}`);
    // In production: integrate with Twilio or SMS API
};
