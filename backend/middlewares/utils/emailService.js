import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true, // Use true for 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export const sendEmail = async (to, subject, html) => {
    try {
        const mailOptions = {
            from: `"Joyory" <${process.env.SMTP_FROM}>`,
            to,
            subject,
            html,
        };

        const result = await transporter.sendMail(mailOptions);
        return result;
    } catch (error) {
        console.error("❌ Email sending failed:", error.message);
        throw error;
    }
};
