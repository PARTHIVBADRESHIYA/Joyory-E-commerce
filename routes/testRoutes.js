import express from "express";
import { sendEmail } from "../middlewares/utils/emailService.js";

const router = express.Router();

router.get("/test-email", async (req, res) => {
    try {
        await sendEmail(
            "test@fake.com", // This goes to Mailtrap, not real user
            "Test Email from MyStore",
            "<h2>This is a test email</h2><p>It works!</p>"
        );
        res.send("✅ Email sent successfully!");
    } catch (error) {
        res.status(500).send("❌ Email failed: " + error.message);
    }
});

export default router;
