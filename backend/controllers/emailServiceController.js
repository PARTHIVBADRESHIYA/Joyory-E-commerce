import { sendEmail } from "../middlewares/utils/emailService.js";


export const registerUser = async (req, res) => {
    const { name, email } = req.body;

    // Save user to DB (assume it's already working)

    // Send Welcome Email
    const html = `
    <h2>Hello ${name},</h2>
    <p>Welcome to <strong>MyStore</strong>! We're excited to have you with us.</p>
    <p>Happy shopping 🛍️</p>
  `;

    await sendEmail(email, "Welcome to MyStore", html);

    res.status(201).json({ message: "User registered and welcome email sent" });
};
