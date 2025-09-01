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

// @desc    User Signup (Customer only)
// const userSignup = async (req, res) => {

//     try {
//         const { name, email, password, phone } = req.body;

//         // Validate method
//         if (!preferredOtpMethod || !['email', 'sms'].includes(preferredOtpMethod)) {
//             return res.status(400).json({ message: 'Preferred OTP method must be email or sms' });
//         }

//         // const existing = await User.findOne({ email });
//         // if (existing) return res.status(400).json({ message: 'Email already registered' });

//         // // If user chooses SMS but phone is missing
//         // if (preferredOtpMethod === 'sms' && !phone) {
//         //     return res.status(400).json({ message: 'Phone number is required for SMS OTP' });
//         // }

//         // const plainOtp = generateOTP();
//         // const hashedOtp = await bcrypt.hash(plainOtp, 10);

//         // Save user
//         const user = await User.create({
//             name,
//             email,
//             phone,
//             password,
//             role: 'user',
//             isManual: false,
//             isVerified: false,
//             // otp: {
//             //     code: hashedOtp,
//             //     expiresAt: new Date(Date.now() + 10 * 60 * 1000)
//             // }
//         });

//         // // Send OTP via selected method
//         // if (preferredOtpMethod === 'email') {
//         //     await sendEmail(email, 'Verify your email', `<p>Your verification OTP is: <b>${plainOtp}</b></p>`);
//         // } else {
//         //     try {
//         //         await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
//         //     } catch (err) {
//         //         return res.status(500).json({ message: 'Failed to send SMS', error: err.message });
//         //     }
//         // }

//         // res.status(201).json({
//         //     message: `Signup successful. Please verify your ${preferredOtpMethod} using the OTP sent.`
//         // });


//         return res.status(201).json({
//             message: 'Signup successful. Proceed to OTP verification.',
//             userId: user._id,
//             email: user.email
//         });

//     } catch (err) {
//         res.status(500).json({ message: 'Signup failed', error: err.message });
//     }
// };

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
