// sendSms.js
import twilio from 'twilio';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

/**
 * Sends an SMS using Twilio
 * @param {string} to - Recipient phone number (e.g., '+917984905039')
 * @param {string} message - Message to send
 */
export const sendSms = async (to, message) => {
    try {
        if (!process.env.TWILIO_PHONE_NUMBER) {
            throw new Error("Missing TWILIO_PHONE_NUMBER in env");
        }

        const response = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to,
        });

        return response.sid;

    } catch (error) {
        console.error("❌ Error sending SMS:");
        console.error("🔍 Message:", error.message);
        console.error("📄 Full Error:", error);
        throw new Error("Failed to send SMS");
    }
};
