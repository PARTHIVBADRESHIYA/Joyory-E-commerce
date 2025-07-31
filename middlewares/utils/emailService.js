import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,     // Mailtrap or SendGrid
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Main function to send email
export const sendEmail = async (to, subject, html) => {
    try {
        const mailOptions = {
            from: `"MyStore" <${process.env.SMTP_FROM}>`, // Display name
            to,
            subject,
            html,
        };

        const result = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent:", result.messageId);
        return result;
    } catch (error) {
        console.error("❌ Email sending failed:", error.message);
        throw error;
    }
};
