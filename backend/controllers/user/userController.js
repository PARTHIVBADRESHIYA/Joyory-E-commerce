import User from '../../models/User.js';
import Order from '../../models/Order.js';

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { generateOTP } from '../../middlewares/utils/generateOTP.js';
import { sendEmail } from '../../middlewares/utils/emailService.js';
import { sendSms } from '../../middlewares/utils/sendSms.js';
// import { notifyMainAdmins } from '../middlewares/utils/notifyMainAdmins.js'; // ✅ Make sure this path is correct

// JWT Token Generator
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// ====================== USER SECTION ===================== //
// 📌 User Signup
const userSignup = async (req, res) => {
    try {
        const { name, email, password, phone, preferredOtpMethod } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'name, email and password are required' });
        }

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: 'Email already registered' });

        const method = (preferredOtpMethod && ['email', 'sms'].includes(preferredOtpMethod.toLowerCase()))
            ? preferredOtpMethod.toLowerCase()
            : 'email';
        const willUseSms = method === 'sms' && phone;
        const actualMethod = willUseSms ? 'sms' : 'email';

        const plainOtp = generateOTP();
        const hashedOtp = await bcrypt.hash(plainOtp, 10);
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'user',
            isManual: true,
            isVerified: false,
            preferredOtpMethod: actualMethod,
            otp: { code: hashedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
        });

        try {
            if (actualMethod === 'sms') {
                await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
            } else {
                await sendEmail(email, 'Verify your account', `<p>Your verification OTP is: <b>${plainOtp}</b></p>`);
            }
        } catch (err) {
            console.error('OTP send failed:', err);
            return res.status(500).json({
                message: 'Signup succeeded but sending OTP failed. Please request OTP again.',
                error: err.message
            });
        }

        return res.status(201).json({
            message: 'Signup successful. OTP sent.',
            method: actualMethod,
            email: user.email
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: 'Signup failed', error: err.message });
    }
};
// @desc    User Login (5 attempts → 5min lock)
const userLogin = async (req, res) => {
    try {
        const { email, password } = req.body;


        const user = await User.findOne({ email });
        if (!user || user.role !== 'user') return res.status(401).json({ message: 'Invalid credentials' });

        if (!user.isVerified) {
            return res.status(403).json({ message: 'Please verify your email before logging in.' });
        }


        // Check lock
        if (user.lockUntil && user.lockUntil > new Date()) {
            const remaining = user.lockUntil - new Date();
            const m = Math.floor((remaining % 3600000) / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            return res.status(403).json({ message: `Account locked. Try again in ${m}m ${s}s.` });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;

            if (user.loginAttempts >= 5) {
                user.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
                user.loginAttempts = 0;
            }

            await user.save();
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Success
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();

        const token = generateToken(user);
        res.status(200).json({ token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// Track Product View (with authenticated user)
const trackProductView = async (req, res) => {
    try {
        const { productId, category } = req.body;
        const userId = req.user._id;

        if (!productId || !category) {
            return res.status(400).json({ message: "Product ID and category are required" });
        }

        // Push to beginning, remove duplicates, trim to last 20 items
        await User.findByIdAndUpdate(
            userId,
            {
                $pull: { recentProducts: productId, recentCategories: category }
            }
        );

        await User.findByIdAndUpdate(
            userId,
            {
                $push: {
                    recentProducts: { $each: [productId], $position: 0, $slice: 20 },
                    recentCategories: { $each: [category], $position: 0, $slice: 20 }
                }
            },
            { new: true }
        );

        res.json({ message: "User activity updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating user activity" });
    }
};



export {
    userSignup,
    userLogin,
    trackProductView
};





// // controllers/user/userController.js
// import User from '../../models/User.js';
// import jwt from 'jsonwebtoken';
// import bcrypt from 'bcryptjs';
// import { generateOTP } from '../../middlewares/utils/generateOTP.js';
// import { sendSms } from '../../middlewares/utils/sendSms.js';

// // ====================== Helpers ====================== //
// const generateToken = (user) =>
//     jwt.sign(
//         { id: user._id, role: user.role },
//         process.env.JWT_SECRET,
//         { expiresIn: '7d' }
//     );

// // ====================== USER SECTION ===================== //

// // 📌 User Signup (OTP → SMS)
// const userSignup = async (req, res) => {
//     try {
//         const { name, email, password, phone } = req.body;

//         if (!name || !email || !password || !phone) {
//             return res.status(400).json({ message: 'Name, email, phone and password are required' });
//         }

//         const existing = await User.findOne({ $or: [{ email }, { phone }] });
//         if (existing) {
//             return res.status(400).json({ message: 'Email or phone already registered' });
//         }

//         // Generate OTP + hash
//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         const user = await User.create({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: 'user',
//             isManual: true,
//             isVerified: false,
//             otp: {
//                 code: hashedOtp,
//                 expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min
//             }
//         });

//         // Send OTP via SMS
//         await sendSms(phone, `Your verification OTP is: ${plainOtp}`);

//         res.status(201).json({
//             message: 'Signup successful. OTP sent to phone.',
//             phone: user.phone
//         });
//     } catch (err) {
//         console.error('Signup error:', err);
//         res.status(500).json({ message: 'Signup failed', error: err.message });
//     }
// };

// // 📌 Verify OTP (Signup / Login)
// const verifyOtp = async (req, res) => {
//     try {
//         const { phone, otp } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         if (!user.otp || !user.otp.code) {
//             return res.status(400).json({ message: 'No OTP requested' });
//         }

//         if (user.otp.expiresAt < new Date()) {
//             return res.status(400).json({ message: 'OTP expired' });
//         }

//         const isMatch = await bcrypt.compare(otp, user.otp.code);
//         if (!isMatch) {
//             return res.status(400).json({ message: 'Invalid OTP' });
//         }

//         user.isVerified = true;
//         user.otp = undefined;
//         await user.save();

//         const token = generateToken(user);

//         res.json({ message: 'OTP verified successfully', token });
//     } catch (err) {
//         console.error('Verify OTP error:', err);
//         res.status(500).json({ message: 'Failed to verify OTP', error: err.message });
//     }
// };

// // 📌 User Login with Email + Password
// const userLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         const user = await User.findOne({ email });
//         if (!user || user.role !== 'user') {
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         if (!user.isVerified) {
//             return res.status(403).json({ message: 'Please verify your phone before logging in.' });
//         }

//         const isMatch = await user.matchPassword(password);
//         if (!isMatch) {
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         const token = generateToken(user);

//         res.status(200).json({
//             token,
//             user: { id: user._id, name: user.name, role: user.role }
//         });
//     } catch (err) {
//         console.error('Login error:', err);
//         res.status(500).json({ message: 'Login failed', error: err.message });
//     }
// };

// // 📌 Login with Phone → Send OTP
// const loginWithPhone = async (req, res) => {
//     try {
//         const { phone } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);

//         user.otp = {
//             code: hashedOtp,
//             expiresAt: new Date(Date.now() + 10 * 60 * 1000)
//         };
//         await user.save();

//         await sendSms(phone, `Your login OTP is: ${plainOtp}`);

//         res.json({ message: 'OTP sent to phone' });
//     } catch (err) {
//         console.error('Phone login error:', err);
//         res.status(500).json({ message: 'Login via phone failed', error: err.message });
//     }
// };

// // 📌 Forgot Password (via phone OTP)
// const forgotPassword = async (req, res) => {
//     try {
//         const { phone } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);

//         user.otp = {
//             code: hashedOtp,
//             expiresAt: new Date(Date.now() + 10 * 60 * 1000)
//         };
//         await user.save();

//         await sendSms(phone, `Your password reset OTP is: ${plainOtp}`);

//         res.json({ message: 'OTP sent for password reset' });
//     } catch (err) {
//         console.error('Forgot password error:', err);
//         res.status(500).json({ message: 'Failed to send OTP', error: err.message });
//     }
// };

// // 📌 Reset Password (after verifying OTP)
// const resetPassword = async (req, res) => {
//     try {
//         const { phone, otp, newPassword } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         if (!user.otp || !user.otp.code) {
//             return res.status(400).json({ message: 'No OTP requested' });
//         }

//         if (user.otp.expiresAt < new Date()) {
//             return res.status(400).json({ message: 'OTP expired' });
//         }

//         const isMatch = await bcrypt.compare(otp, user.otp.code);
//         if (!isMatch) {
//             return res.status(400).json({ message: 'Invalid OTP' });
//         }

//         user.password = await bcrypt.hash(newPassword, 10);
//         user.otp = undefined;
//         await user.save();

//         res.json({ message: 'Password reset successful' });
//     } catch (err) {
//         console.error('Reset password error:', err);
//         res.status(500).json({ message: 'Failed to reset password', error: err.message });
//     }
// };

// const trackProductView = async (req, res) => { try { const { productId, category } = req.body; const userId = req.user._id; if (!productId || !category) { return res.status(400).json({ message: "Product ID and category are required" }); } await User.findByIdAndUpdate(userId, { $pull: { recentProducts: productId, recentCategories: category } }); await User.findByIdAndUpdate(userId, { $push: { recentProducts: { $each: [productId], $position: 0, $slice: 20 }, recentCategories: { $each: [category], $position: 0, $slice: 20 } } }, { new: true }); res.json({ message: "User activity updated successfully" }); } catch (error) { console.error(error); res.status(500).json({ message: "Error updating user activity" }); } };

// export {
//     userSignup,
//     verifyOtp,
//     userLogin,
//     loginWithPhone,
//     forgotPassword,
//     resetPassword,
//     trackProductView
// };
