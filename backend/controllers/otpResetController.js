// controllers/otpController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateOTP } from '../middlewares/utils/generateOTP.js';
import { sendEmail, sendWelcomeEmail } from '../middlewares/utils/emailService.js';
import { sendSms } from '../middlewares/utils/sendSms.js';

import Admin from '../models/Admin.js';
import PendingUser from "../models/PendingAdmin.js";
import AdminRoleAdmin from '../models/settings/admin/AdminRoleAdmin.js';
import TeamMember from '../models/settings/admin/TeamMember.js';
import User from '../models/User.js';
import Referral from "../models/Referral.js";
import ReferralConfig from "../models/ReferralConfig.js";
import { getOrCreateWallet } from "../middlewares/utils/walletHelpers.js";
import { addRewardPoints } from '../controllers/user/userWalletController.js';

import {
    sendOtpSchema,
    otpLoginSchema,
    resetPasswordWithOtpSchema,
    verifyEmailOtpSchema
} from '../middlewares/validations/otpValidation.js';

const JWT_SECRET = process.env.JWT_SECRET;

// Helper: Get correct user model
const getUserByType = async (type, email) => {
    const userType = type || 'user'; // default to 'user' if type missing   
    switch (userType) {
        case 'admin': return Admin.findOne({ email });
        case 'roleAdmin': return AdminRoleAdmin.findOne({ email });
        case 'teamMember': return TeamMember.findOne({ email });
        case 'user': return User.findOne({ email });
        case "seller": return Seller.findOne({ email }); // ✅ added
        default: return null;
    }
};
// 📌 Send OTP
export const sendOtpToUser = async (req, res) => {
    const { error } = sendOtpSchema.validate(req.body, { allowUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { email, type, preferredOtpMethod } = req.body;
    const user = await getUserByType(type, email);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    // Rate limit: max 3 OTPs in last 10 minutes
    user.otpRequests = (user.otpRequests || []).filter(ts => new Date(ts) > now - 10 * 60 * 1000);
    if (user.otpRequests.length >= 3) {
        return res.status(429).json({ message: 'Too many OTP requests. Try again later.' });
    }

    // Generate + hash OTP
    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.otp = {
        code: hashedOtp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // expires in 5 mins
        attemptsLeft: 3
    };
    user.otpRequests.push(now);
    await user.save();

    const method = (preferredOtpMethod && ['sms', 'email'].includes(preferredOtpMethod.toLowerCase()))
        ? preferredOtpMethod.toLowerCase()
        : 'email';

    try {
        if (method === 'sms') {
            if (!user.phone) return res.status(400).json({ message: 'Phone not available for SMS' });
            await sendSms(user.phone, `Your OTP is: ${otp}`);
        } else {
            await sendEmail(user.email, 'OTP for Login/Verification', `<p>Your OTP is: <b>${otp}</b></p>`);
        }
        return res.status(200).json({ message: `OTP sent via ${method.toUpperCase()}` });
    } catch (e) {
        return res.status(500).json({ message: 'Failed to send OTP', error: e.message });
    }
};

// 📌 Login with OTP
export const loginWithOtp = async (req, res) => {
    const { error } = otpLoginSchema.validate(req.body, { allowUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { email, otp, type } = req.body;
    const user = await getUserByType(type, email);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otp?.code) {
        return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
    }

    if (new Date() > new Date(user.otp.expiresAt)) {
        user.otp = undefined;
        await user.save();
        return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (user.otp.attemptsLeft <= 0) {
        user.otp = undefined;
        await user.save();
        return res.status(403).json({ message: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    const isValid = await bcrypt.compare(otp, user.otp.code);
    if (!isValid) {
        user.otp.attemptsLeft -= 1;
        await user.save();
        return res.status(401).json({ message: 'Incorrect OTP', attemptsLeft: user.otp.attemptsLeft });
    }

    user.otp = undefined;
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(200).json({
        message: 'OTP login successful',
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });

};

// 📌 Reset password with OTP
export const resetPasswordWithOtp = async (req, res) => {
    const { error } = resetPasswordWithOtpSchema.validate(req.body, { allowUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { email, type, otp, newPassword } = req.body;
    const user = await getUserByType(type, email);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otp?.code) {
        return res.status(400).json({ message: 'No OTP found for this user' });
    }

    if (new Date() > new Date(user.otp.expiresAt)) {
        user.otp = undefined;
        await user.save();
        return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (user.otp.attemptsLeft <= 0) {
        user.otp = undefined;
        await user.save();
        return res.status(403).json({ message: 'Too many incorrect attempts. Request a new OTP.' });
    }

    const isValid = await bcrypt.compare(otp, user.otp.code);
    if (!isValid) {
        user.otp.attemptsLeft -= 1;
        await user.save();
        return res.status(400).json({ message: 'Incorrect OTP', attemptsLeft: user.otp.attemptsLeft });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    await user.save();

    return res.status(200).json({ message: 'Password reset successful' });
};

export const verifyEmailOtp = async (req, res) => {
    try {
        const { error } = verifyEmailOtpSchema.validate(req.body, { allowUnknown: true });
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email, otp } = req.body;

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.isVerified) return res.status(400).json({ message: "User already verified" });

        if (!user.otp?.code || new Date() > new Date(user.otp.expiresAt)) {
            user.otp = undefined;
            await user.save();
            return res.status(400).json({ message: "OTP expired or not requested" });
        }

        if (user.otp.attemptsLeft <= 0) {
            user.otp = undefined;
            await user.save();
            return res.status(429).json({ message: "Too many invalid attempts. Request new OTP." });
        }

        const isValid = await bcrypt.compare(otp, user.otp.code);
        if (!isValid) {
            user.otp.attemptsLeft -= 1;
            await user.save();
            return res.status(401).json({ message: `Invalid OTP. ${user.otp.attemptsLeft} attempts left.` });
        }

        // OTP valid → verify user
        user.isVerified = true;
        user.otp = undefined;
        user.otpRequests = [];
        await user.save();

        // -------------------------
        // REFERRAL REWARD HANDLING
        // -------------------------

        let referrerReward = 0;
        let refereeReward = 0;
        let referrerName = null;

        if (user.referredBy) {
            const config = await ReferralConfig.findOne();
            if (config) {
                const referrer = await User.findById(user.referredBy);
                if (referrer) {

                    referrerName = referrer.name;
                    referrerReward = config.rewardForReferrer;
                    refereeReward = config.rewardForReferee;

                    await addRewardPoints({
                        userId: referrer._id,
                        points: referrerReward,
                        description: `Referral reward for inviting ${user.name}`,
                    });

                    await addRewardPoints({
                        userId: user._id,
                        points: refereeReward,
                        description: "Referral signup reward",
                    });
                }
            }
        }

        // Fetch wallet
        const wallet = await getOrCreateWallet(user._id);

        // Send welcome email
        try {
            await sendWelcomeEmail(user, wallet, {
                referrerReward,
                refereeReward,
                referrerName
            });
        } catch (emailError) {
            console.error("Welcome email failed:", emailError);
        }

        return res.status(200).json({
            message: "Email verified successfully!",
            walletBalance: wallet.joyoryCash + wallet.rewardPoints,
            joyoryCash: wallet.joyoryCash,
            rewardPoints: wallet.rewardPoints,
            transactions: wallet.transactions.slice().reverse().slice(0, 50),
        });

    } catch (err) {
        console.error("Error verifying email OTP:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};


export const sendOtpUnified = async (req, res) => {
    try {
        const { email, preferredOtpMethod } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        // 🔢 GENERATE + HASH OTP
        const otp = generateOTP();
        const hashedOtp = await bcrypt.hash(otp, 10);

        // 🔁 STORE OTP IN A TEMP COLLECTION FOR ANY EMAIL
        await PendingUser.findOneAndUpdate(
            { email },
            {
                email,
                otp: {
                    code: hashedOtp,
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // expires in 5 mins
                    attemptsLeft: 5
                },
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        // 📩 SEND METHOD
        const method = (preferredOtpMethod &&
            ["sms", "email"].includes(preferredOtpMethod.toLowerCase()))
            ? preferredOtpMethod.toLowerCase()
            : "email";

        // 📤 SEND OTP
        if (method === "sms") {
            return res.status(400).json({
                success: false,
                message: "SMS not supported without phone number"
            });
        }

        await sendEmail(
            email,
            "OTP Verification",
            `<p>Your OTP is: <b>${otp}</b></p>`
        );

        return res.status(200).json({
            success: true,
            message: `OTP sent to ${email}`
        });

    } catch (err) {
        console.error("sendOtpUnified error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP",
            error: err.message
        });
    }
};




// Login Admin with OTP
export const adminLoginWithOtp = async (req, res) => {
    const { email, otp } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    if (!admin.otp?.code) {
        return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
    }
    if (new Date() > new Date(admin.otp.expiresAt)) {
        admin.otp = undefined;
        await admin.save();
        return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (admin.otp.attemptsLeft <= 0) {
        admin.otp = undefined;
        await admin.save();
        return res.status(403).json({ message: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    const isValid = await bcrypt.compare(otp, admin.otp.code);
    if (!isValid) {
        admin.otp.attemptsLeft -= 1;
        await admin.save();
        return res.status(401).json({ message: 'Incorrect OTP', attemptsLeft: admin.otp.attemptsLeft });
    }

    admin.otp = undefined;
    await admin.save();

    const token = jwt.sign({ id: admin._id, role: admin.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
        message: 'OTP login successful',
        token,
        admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role }
    });
};

export const verifyUnifiedOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const pending = await PendingUser.findOne({ email });
        if (!pending)
            return res.status(404).json({ message: "OTP expired or not requested" });

        // Check OTP expiry
        if (new Date() > new Date(pending.otp.expiresAt)) {
            await PendingUser.deleteOne({ email });
            return res.status(400).json({ message: "OTP expired" });
        }

        // Check attempts
        if (pending.otp.attemptsLeft <= 0) {
            await PendingUser.deleteOne({ email });
            return res.status(429).json({ message: "Too many wrong attempts" });
        }

        // Compare OTP
        const ok = await bcrypt.compare(otp, pending.otp.code);
        if (!ok) {
            pending.otp.attemptsLeft -= 1;
            await pending.save();
            return res.status(401).json({ message: `Invalid OTP. ${pending.otp.attemptsLeft} attempts left.` });
        }

        let createdUser;

        // CREATE FINAL USER BASED ON TYPE
        if (pending.userType === "SUPER_ADMIN") {
            createdUser = await Admin.create({
                name: pending.name,
                email,
                password: pending.password,
                isSuperAdmin: true,
                isVerified: true
            });
        }

        if (pending.userType === "ROLE_ADMIN") {
            createdUser = await AdminRoleAdmin.create({
                name: pending.name,
                email,
                password: pending.password,
                role: pending.roleId
            });
        }

        if (pending.userType === "TEAM_MEMBER") {
            createdUser = await TeamMember.create({
                name: pending.name,
                email,
                password: pending.password,
                role: pending.roleId,
                permissionSubset: pending.permissionSubset
            });
        }

        await PendingUser.deleteOne({ email });

        return res.status(200).json({
            message: "OTP verified. Account activated.",
            id: createdUser._id,
            type: pending.userType
        });

    } catch (err) {
        console.error("verifyUnifiedOtp error:", err);
        return res.status(500).json({ message: "OTP verification failed", error: err.message });
    }
};


export const sendForgotPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        let user = null;
        let userType = null;

        // Find user from 3 models
        user = await Admin.findOne({ email });
        if (user) userType = "SUPER_ADMIN";

        if (!user) {
            user = await AdminRoleAdmin.findOne({ email });
            if (user) userType = "ROLE_ADMIN";
        }

        if (!user) {
            user = await TeamMember.findOne({ email });
            if (user) userType = "TEAM_MEMBER";
        }

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Generate OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

        // Save OTP in the REAL USER model
        user.otp = {
            code: hashedOtp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // expires in 5 mins
            attemptsLeft: 5
        };

        await user.save();

        // Send email
        await sendEmail(
            email,
            "Password Reset OTP",
            `<p>Your OTP: <b>${otp}</b></p>`
        );

        return res.status(200).json({
            message: "OTP sent for password reset",
            userType
        });

    } catch (err) {
        console.error("sendForgotPasswordOtp error:", err);
        return res.status(500).json({ message: "Failed to send reset OTP", error: err.message });
    }
};


// 📌 Reset Admin Password with OTP (same behavior as user reset)
export const resetAdminPasswordWithOtp = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        let user = null;
        let userType = null;

        // 1️⃣ FIND USER
        user = await Admin.findOne({ email });
        if (user) userType = "SUPER_ADMIN";

        if (!user) {
            user = await AdminRoleAdmin.findOne({ email });
            if (user) userType = "ROLE_ADMIN";
        }

        if (!user) {
            user = await TeamMember.findOne({ email });
            if (user) userType = "TEAM_MEMBER";
        }

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2️⃣ CHECK OTP
        if (!user.otp?.code) {
            return res.status(400).json({ message: "OTP not found. Request a new one." });
        }

        // 3️⃣ EXPIRY
        if (new Date() > new Date(user.otp.expiresAt)) {
            user.otp = undefined;
            await user.save();
            return res.status(400).json({ message: "OTP expired. Request a new one." });
        }

        // 4️⃣ ATTEMPTS
        if (user.otp.attemptsLeft <= 0) {
            user.otp = undefined;
            await user.save();
            return res.status(429).json({ message: "Too many wrong attempts. Request new OTP." });
        }

        // 5️⃣ MATCH OTP
        const ok = await bcrypt.compare(otp, user.otp.code);

        if (!ok) {
            user.otp.attemptsLeft -= 1;
            await user.save();
            return res.status(401).json({
                message: "Incorrect OTP",
                attemptsLeft: user.otp.attemptsLeft
            });
        }

        // 6️⃣ SUCCESS → RESET PASSWORD
        user.password = newPassword;
        user.otp = undefined;
        user.otpRequests = [];
        await user.save();

        return res.status(200).json({
            message: "Password reset successful",
            userType,
            id: user._id
        });

    } catch (err) {
        console.error("resetPasswordWithOtp error:", err);
        return res.status(500).json({ message: "Failed to reset password", error: err.message });
    }
};
