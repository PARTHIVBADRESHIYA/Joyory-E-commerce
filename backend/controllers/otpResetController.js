import { generateOTP } from '../middlewares/utils/generateOTP.js';
import { sendEmail } from '../middlewares/utils/emailService.js';
import { sendSms } from '../middlewares/utils/sendSms.js'; // add at top

import Admin from '../models/Admin.js';
import AdminRoleAdmin from '../models/settings/admin/AdminRoleAdmin.js';
import TeamMember from '../models/settings/admin/TeamMember.js';
import User from '../models/User.js';
import {
    sendOtpSchema,
    otpLoginSchema,
    resetPasswordWithOtpSchema,
    verifyEmailOtpSchema
} from '../middlewares/validations/otpValidation.js';


// controllers/otpController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;


export const sendOtpToUser = async (req, res) => {
    const { error } = sendOtpSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { email, type, preferredOtpMethod } = req.body;

    let user;
    if (type === 'admin') user = await Admin.findOne({ email });
    else if (type === 'roleAdmin') user = await AdminRoleAdmin.findOne({ email });
    else if (type === 'teamMember') user = await TeamMember.findOne({ email });
    else if (type === 'user') user = await User.findOne({ email });
    else return res.status(400).json({ message: 'Invalid user type provided' });

    if (!user) return res.status(404).json({ message: 'User not found' });

    // 💡 Rate limit OTP sends (max 3 in 10 mins)
    const now = new Date();
    if (!user.otpRequests) user.otpRequests = [];

    // Remove old entries older than 10 mins
    user.otpRequests = user.otpRequests.filter(ts => new Date(ts) > new Date(now - 10 * 60 * 1000));

    if (user.otpRequests.length >= 3) {
        return res.status(429).json({ message: 'Too many OTP requests. Try again later.' });
    }

    // ✅ Generate & store OTP
    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.otp = {
        code: hashedOtp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attemptsLeft: 3 // Max 5 tries to enter OTP
    };

    user.otpRequests.push(now);
    await user.save();

    const method = preferredOtpMethod || 'email';

    try {
        if (method === 'sms') {
            if (!user.phone) return res.status(400).json({ message: 'Phone number not available for SMS' });
            await sendSms(user.phone, `Your OTP is: ${otp}`);
        } else {
            await sendEmail(user.email, 'OTP for Login/Reset', `<p>Your OTP is: <b>${otp}</b></p>`);
        }

        return res.status(200).json({ message: `OTP sent via ${method.toUpperCase()}` });
    } catch (e) {
        return res.status(500).json({ message: 'Failed to send OTP', error: e.message });
    }
};

export const loginWithOtp = async (req, res) => {
    const { error } = otpLoginSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    try {
        const { email, otp, type } = req.body;

        if (!email || !otp || !type) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Identify the correct user model
        let user;
        if (type === 'admin') user = await Admin.findOne({ email });
        else if (type === 'roleAdmin') user = await AdminRoleAdmin.findOne({ email });
        else if (type === 'teamMember') user = await TeamMember.findOne({ email });
        else user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.otp || !user.otp.code) {
            return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
        }

        // Expired
        if (new Date() > new Date(user.otp.expiresAt)) {
            user.otp = undefined;
            await user.save();
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        // Attempts over
        if (user.otp.attemptsLeft <= 0) {
            user.otp = undefined;
            await user.save();
            return res.status(403).json({ message: 'Too many incorrect attempts. Please request a new OTP.' });
        }

        const isValid = await bcrypt.compare(otp, user.otp.code);

        if (!isValid) {
            user.otp.attemptsLeft -= 1;
            await user.save();
            return res.status(401).json({
                message: 'Incorrect OTP',
                attemptsLeft: user.otp.attemptsLeft
            });
        }

        // OTP valid
        user.otp = undefined;
        await user.save();

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            message: 'OTP login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error("Login with OTP error:", err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};





export const resetPasswordWithOtp = async (req, res) => {
    const { error } = resetPasswordWithOtpSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    try {
        const { email, type, otp, newPassword } = req.body;

        if (!email || !type || !otp || !newPassword) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        let user;
        if (type === 'admin') user = await Admin.findOne({ email });
        else if (type === 'roleAdmin') user = await AdminRoleAdmin.findOne({ email });
        else if (type === 'teamMember') user = await TeamMember.findOne({ email });
        else user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: 'User not found' });

        // OTP checks
        if (!user.otp || !user.otp.code) {
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
            return res.status(400).json({
                message: 'Incorrect OTP',
                attemptsLeft: user.otp.attemptsLeft
            });
        }

        // Hash and save new password
        user.password = await bcrypt.hash(newPassword, 10);

        // Clear OTP
        user.otp = undefined;

        await user.save();
        return res.status(200).json({ message: 'Password reset successful' });
    } catch (err) {
        console.error("Error resetting password:", err);
        res.status(500).json({ message: 'Internal server error' });
    }
};


export const verifyEmailOtp = async (req, res) => {
    const { error } = verifyEmailOtpSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

    if (!user.otp || !user.otp.code || new Date() > user.otp.expiresAt) {
        return res.status(400).json({ message: 'OTP expired or not requested' });
    }

    const isValid = await bcrypt.compare(otp, user.otp.code);
    if (!isValid) return res.status(401).json({ message: 'Invalid OTP' });

    user.isVerified = true;
    user.otp = undefined;
    await user.save();

    res.status(200).json({ message: 'Email verified successfully. You can now login.' });
};
