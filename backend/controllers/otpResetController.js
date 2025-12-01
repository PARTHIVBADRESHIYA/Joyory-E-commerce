// controllers/otpController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateOTP } from '../middlewares/utils/generateOTP.js';
import { sendEmail } from '../middlewares/utils/emailService.js';
import { sendSms } from '../middlewares/utils/sendSms.js';

import Admin from '../models/Admin.js';
import PendingAdmin from "../models/PendingAdmin.js";
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
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // expires in 10 mins
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

// Verify OTP
// export const verifyEmailOtp = async (req, res) => {
//     const { error } = verifyEmailOtpSchema.validate(req.body, { allowUnknown: true });
//     if (error) return res.status(400).json({ message: error.details[0].message });

//     const { email, otp } = req.body;
//     const user = await User.findOne({ email: email.trim().toLowerCase() });
//     if (!user) return res.status(404).json({ message: 'User not found' });
//     if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

//     // Check OTP existence & expiry
//     if (!user.otp?.code || new Date() > new Date(user.otp.expiresAt)) {
//         user.otp = undefined;
//         await user.save();
//         return res.status(400).json({ message: 'OTP expired or not requested' });
//     }

//     // Check attempts
//     if (user.otp.attemptsLeft <= 0) {
//         user.otp = undefined;
//         await user.save();
//         return res.status(429).json({ message: 'Too many invalid attempts. Request a new OTP.' });
//     }

//     // Validate OTP
//     const isValid = await bcrypt.compare(otp, user.otp.code);
//     if (!isValid) {
//         user.otp.attemptsLeft -= 1;
//         await user.save();
//         return res.status(401).json({ message: `Invalid OTP. ${user.otp.attemptsLeft} attempts left.` });
//     }

//     // Success: verify user & clear OTP data
//     user.isVerified = true;
//     user.otp = undefined;
//     user.otpRequests = [];
//     await user.save();

//     return res.status(200).json({ message: 'Email verified successfully. You can now login.' });
// };






// export const verifyEmailOtp = async (req, res) => {
//     const { error } = verifyEmailOtpSchema.validate(req.body, { allowUnknown: true });
//     if (error) return res.status(400).json({ message: error.details[0].message });

//     const { email, otp } = req.body;
//     const user = await User.findOne({ email: email.trim().toLowerCase() });
//     if (!user) return res.status(404).json({ message: "User not found" });
//     if (user.isVerified) return res.status(400).json({ message: "User already verified" });

//     // Check OTP existence & expiry
//     if (!user.otp?.code || new Date() > new Date(user.otp.expiresAt)) {
//         user.otp = undefined;
//         await user.save();
//         return res.status(400).json({ message: "OTP expired or not requested" });
//     }

//     // Check attempts
//     if (user.otp.attemptsLeft <= 0) {
//         user.otp = undefined;
//         await user.save();
//         return res.status(429).json({ message: "Too many invalid attempts. Request a new OTP." });
//     }

//     // Validate OTP
//     const isValid = await bcrypt.compare(otp, user.otp.code);
//     if (!isValid) {
//         user.otp.attemptsLeft -= 1;
//         await user.save();
//         return res.status(401).json({ message: `Invalid OTP. ${user.otp.attemptsLeft} attempts left.` });
//     }

//     // ✅ Success: verify user & clear OTP
//     user.isVerified = true;
//     user.otp = undefined;
//     user.otpRequests = [];

//     // ✅ Handle referral rewards instantly
//     if (user.referredBy) {
//         const config = await ReferralConfig.findOne();
//         if (config) {
//             const referrer = await User.findById(user.referredBy);

//             if (referrer) {
//                 // reward referrer
//                 referrer.walletBalance += config.rewardForReferrer;
//                 await referrer.save();

//                 // reward referee
//                 user.walletBalance += config.rewardForReferee;
//             }
//         }
//     }

//     await user.save();

//     return res.status(200).json({
//         message:
//             "Email verified successfully. Referral rewards applied instantly (if any). You can now login.",
//         walletBalance: user.walletBalance,
//     });
// };

// ====================== ADMIN OTP FLOWS ===================== //

// Send OTP to Admin



export const verifyEmailOtp = async (req, res) => {
    try {
        // 1️⃣ Validate request
        const { error } = verifyEmailOtpSchema.validate(req.body, { allowUnknown: true });
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email, otp } = req.body;
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.isVerified) return res.status(400).json({ message: "User already verified" });

        // 2️⃣ Check OTP existence & expiry
        if (!user.otp?.code || new Date() > new Date(user.otp.expiresAt)) {
            user.otp = undefined;
            await user.save();
            return res.status(400).json({ message: "OTP expired or not requested" });
        }

        // 3️⃣ Check attempts
        if (user.otp.attemptsLeft <= 0) {
            user.otp = undefined;
            await user.save();
            return res.status(429).json({ message: "Too many invalid attempts. Request a new OTP." });
        }

        // 4️⃣ Validate OTP
        const isValid = await bcrypt.compare(otp, user.otp.code);
        if (!isValid) {
            user.otp.attemptsLeft -= 1;
            await user.save();
            return res.status(401).json({ message: `Invalid OTP. ${user.otp.attemptsLeft} attempts left.` });
        }

        // 5️⃣ ✅ Success: verify user & clear OTP
        user.isVerified = true;
        user.otp = undefined;
        user.otpRequests = [];
        await user.save();

        // 6️⃣ Handle referral rewards
        if (user.referredBy) {
            const config = await ReferralConfig.findOne();
            if (config) {
                const referrer = await User.findById(user.referredBy);
                if (referrer) {
                    // Reward referrer in Wallet
                    await addRewardPoints({
                        userId: referrer._id,
                        points: config.rewardForReferrer,
                        description: `Referral reward for inviting ${user.name}`,
                    });

                    // Reward referee in Wallet
                    await addRewardPoints({
                        userId: user._id,
                        points: config.rewardForReferee,
                        description: "Referral signup reward",
                    });
                }
            }
        }

        // 7️⃣ Fetch wallet of current user to return points
        const wallet = await getOrCreateWallet(user._id);

        return res.status(200).json({
            message: "Email verified successfully. Referral rewards applied instantly (if any). You can now login.",
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


export const sendOtpToAdmin = async (req, res) => {
    const { email, preferredOtpMethod } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const now = new Date();
    admin.otpRequests = (admin.otpRequests || []).filter(ts => new Date(ts) > now - 10 * 60 * 1000);
    if (admin.otpRequests.length >= 3) {
        return res.status(429).json({ message: 'Too many OTP requests. Try again later.' });
    }

    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    admin.otp = {
        code: hashedOtp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attemptsLeft: 3
    };
    admin.otpRequests.push(now);
    await admin.save();

    const method = (preferredOtpMethod && ['sms', 'email'].includes(preferredOtpMethod.toLowerCase()))
        ? preferredOtpMethod.toLowerCase()
        : 'email';

    try {
        if (method === 'sms') {
            if (!admin.phone) return res.status(400).json({ message: 'Phone not available for SMS' });
            await sendSms(admin.phone, `Your OTP is: ${otp}`);
        } else {
            await sendEmail(admin.email, 'OTP for Login/Verification', `<p>Your OTP is: <b>${otp}</b></p>`);
        }
        res.status(200).json({ message: `OTP sent via ${method.toUpperCase()}` });
    } catch (err) {
        res.status(500).json({ message: 'Failed to send OTP', error: err.message });
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

// Verify Admin Email OTP (after registration)
// export const verifyAdminEmailOtp = async (req, res) => {
//     const { email, otp } = req.body;

//     const admin = await Admin.findOne({ email });
//     if (!admin) return res.status(404).json({ message: 'Admin not found' });
//     if (admin.isVerified) return res.status(400).json({ message: 'Admin already verified' });

//     if (!admin.otp?.code || new Date() > new Date(admin.otp.expiresAt)) {
//         admin.otp = undefined;
//         await admin.save();
//         return res.status(400).json({ message: 'OTP expired or not requested' });
//     }

//     if (admin.otp.attemptsLeft <= 0) {
//         admin.otp = undefined;
//         await admin.save();
//         return res.status(429).json({ message: 'Too many invalid attempts. Request a new OTP.' });
//     }

//     const isValid = await bcrypt.compare(otp, admin.otp.code);
//     if (!isValid) {
//         admin.otp.attemptsLeft -= 1;
//         await admin.save();
//         return res.status(401).json({ message: `Invalid OTP. ${admin.otp.attemptsLeft} attempts left.` });
//     }

//     admin.isVerified = true;
//     admin.otp = undefined;
//     admin.otpRequests = [];
//     await admin.save();

//     return res.status(200).json({ message: 'Email verified successfully. You can now login.' });
// };

// Verify Admin Email OTP (after registration)
export const verifyAdminEmailOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Check pending admin
        const pending = await PendingAdmin.findOne({ email });
        if (!pending) {
            return res.status(404).json({ message: "No pending admin found or OTP expired" });
        }

        // Check OTP expiry
        if (!pending.otp?.code || new Date() > new Date(pending.otp.expiresAt)) {
            await PendingAdmin.deleteOne({ email }); // cleanup
            return res.status(400).json({ message: "OTP expired or not requested" });
        }

        // Check attempts
        if (pending.otp.attemptsLeft <= 0) {
            await PendingAdmin.deleteOne({ email });
            return res.status(429).json({ message: "Too many invalid attempts. Please register again." });
        }

        // Compare OTP
        const isValid = await bcrypt.compare(otp, pending.otp.code);
        if (!isValid) {
            pending.otp.attemptsLeft -= 1;
            await pending.save();
            return res.status(401).json({
                message: `Invalid OTP. ${pending.otp.attemptsLeft} attempts left.`,
            });
        }

        // ✅ OTP is valid → Create real Admin
        const admin = await Admin.create({
            name: pending.name,
            email: pending.email,
            password: pending.password, // already hashed
            isSuperAdmin: pending.isSuperAdmin,  // <<<< ADD THIS
            isVerified: true,
        });

        // Cleanup
        await PendingAdmin.deleteOne({ email });

        return res.status(201).json({
            message: "Email verified successfully. Admin created. You can now login.",
            adminId: admin._id,
        });
    } catch (err) {
        console.error("Verify Admin OTP Error:", err);
        return res.status(500).json({
            message: "OTP verification failed",
            error: err.message,
        });
    }
};

// 📌 Reset Admin Password with OTP (same behavior as user reset)
export const resetAdminPasswordWithOtp = async (req, res) => {
    // ✅ optional validation (you can use a separate adminResetPasswordWithOtpSchema if you want)
    const { email, otp, newPassword } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    // Check OTP exist
    if (!admin.otp?.code) {
        return res.status(400).json({ message: 'No OTP found for this admin' });
    }

    // Check expiry
    if (new Date() > new Date(admin.otp.expiresAt)) {
        admin.otp = undefined;
        await admin.save();
        return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Attempts left
    if (admin.otp.attemptsLeft <= 0) {
        admin.otp = undefined;
        await admin.save();
        return res.status(403).json({ message: 'Too many incorrect attempts. Request a new OTP.' });
    }

    // Compare
    const isValid = await bcrypt.compare(otp, admin.otp.code);
    if (!isValid) {
        admin.otp.attemptsLeft -= 1;
        await admin.save();
        return res.status(400).json({ message: 'Incorrect OTP', attemptsLeft: admin.otp.attemptsLeft });
    }

    // ✅ Success → reset password + clear OTP
    admin.password = newPassword; // let the pre-save hook hash it    admin.otp = undefined;
    admin.otpRequests = [];
    await admin.save();

    return res.status(200).json({ message: 'Password reset successful' });
};
