// controllers/sellerAuthController.js
import Seller from "../models/Seller.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendEmail } from "../middlewares/utils/emailService.js";
import { generateOTP } from "../middlewares/utils/generateOTP.js";

const JWT_SECRET = process.env.JWT_SECRET;

// Seller Login
export const sellerLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const seller = await Seller.findOne({ email });
        if (!seller) return res.status(400).json({ message: "Invalid credentials" });

        const match = await bcrypt.compare(password, seller.password);
        if (!match) return res.status(400).json({ message: "Invalid credentials" });

        const token = jwt.sign(
            { id: seller._id, role: "seller" },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.json({
            message: "Login successful",
            token,
            seller: {
                id: seller._id,
                email: seller.email,
                businessName: seller.businessName,
                status: seller.status
            }
        });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ---------------- OTP-based Reset ---------------- //

// Send OTP for password reset
export const sellerSendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        const seller = await Seller.findOne({ email });
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        const otp = generateOTP();
        const hashedOtp = await bcrypt.hash(otp, 10);

        seller.otp = {
            code: hashedOtp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
            attemptsLeft: 3
        };
        seller.otpRequests = (seller.otpRequests || []).filter(ts => new Date(ts) > Date.now() - 10 * 60 * 1000);
        seller.otpRequests.push(new Date());

        await seller.save();
        await sendEmail(seller.email, "Password Reset OTP", `Your OTP: ${otp}`);

        return res.json({ message: "OTP sent to email" });
    } catch (err) {
        return res.status(500).json({ message: "Error sending OTP", error: err.message });
    }
};

// Reset Password with OTP
export const sellerResetPasswordWithOtp = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const seller = await Seller.findOne({ email });
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        if (!seller.otp?.code) return res.status(400).json({ message: "No OTP found. Please request a new one." });
        if (new Date() > new Date(seller.otp.expiresAt)) {
            seller.otp = undefined;
            await seller.save();
            return res.status(400).json({ message: "OTP has expired. Please request a new one." });
        }
        if (seller.otp.attemptsLeft <= 0) {
            seller.otp = undefined;
            await seller.save();
            return res.status(403).json({ message: "Too many incorrect attempts. Please request a new OTP." });
        }

        const isValid = await bcrypt.compare(otp, seller.otp.code);
        if (!isValid) {
            seller.otp.attemptsLeft -= 1;
            await seller.save();
            return res.status(400).json({ message: "Incorrect OTP", attemptsLeft: seller.otp.attemptsLeft });
        }

        // ✅ Success: reset password
        seller.password = await bcrypt.hash(newPassword, 10); // hash the new password
        seller.otp = undefined;
        seller.otpRequests = [];
        await seller.save();

        return res.json({ message: "Password reset successful" });
    } catch (err) {
        return res.status(500).json({ message: "Error resetting password", error: err.message });
    }
};
