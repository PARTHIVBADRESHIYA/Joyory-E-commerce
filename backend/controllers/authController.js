import User from '../models/User.js';
import Admin from '../models/Admin.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { generateOTP } from '../middlewares/utils/generateOTP.js';
import { sendEmail } from '../middlewares/utils/emailService.js';
import { sendSms } from '../middlewares/utils/sendSms.js';
import { notifyMainAdmins } from '../middlewares/utils/notifyMainAdmins.js'; // ✅ Make sure this path is correct

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
const userSignup = async (req, res) => {

    try {
        const { name, email, password, confirmPassword, phone, preferredOtpMethod } = req.body;

        // Validate method
        if (!preferredOtpMethod || !['email', 'sms'].includes(preferredOtpMethod)) {
            return res.status(400).json({ message: 'Preferred OTP method must be email or sms' });
        }

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: 'Email already registered' });

        // If user chooses SMS but phone is missing
        if (preferredOtpMethod === 'sms' && !phone) {
            return res.status(400).json({ message: 'Phone number is required for SMS OTP' });
        }

        const plainOtp = generateOTP();
        const hashedOtp = await bcrypt.hash(plainOtp, 10);

        // Save user
        const user = await User.create({
            name,
            email,
            phone,
            password,
            role: 'user',
            isManual: false,
            isVerified: false,
            otp: {
                code: hashedOtp,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000)
            }
        });

        // Send OTP via selected method
        if (preferredOtpMethod === 'email') {
            await sendEmail(email, 'Verify your email', `<p>Your verification OTP is: <b>${plainOtp}</b></p>`);
        } else {
            try {
                await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
            } catch (err) {
                return res.status(500).json({ message: 'Failed to send SMS', error: err.message });
            }
        }

        res.status(201).json({
            message: `Signup successful. Please verify your ${preferredOtpMethod} using the OTP sent.`
        });

    } catch (err) {
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

        console.log('Entered:', password);
        console.log('Stored Hash:', user.password);


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

// ====================== ADMIN SECTION ===================== //

// @desc    Admin Login (3 attempts → 24hr lock, notify only on lock)
const adminLogin = async (req, res) => {  
    try {
        const { email, password } = req.body;

        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

        // Check lock
        if (admin.lockUntil && admin.lockUntil > new Date()) {
            const remaining = admin.lockUntil - new Date();
            const h = Math.floor(remaining / 3600000);
            const m = Math.floor((remaining % 3600000) / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            return res.status(403).json({ message: `Account locked. Try again in ${h}h ${m}m ${s}s.` });
        }

        const isMatch = await admin.matchPassword(password);
        if (!isMatch) {
            admin.loginAttempts = (admin.loginAttempts || 0) + 1;

            if (admin.loginAttempts >= 3) {
                admin.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hrs
                admin.loginAttempts = 0;
                await admin.save();

                // ✅ Notify main admin only when locked
                await notifyMainAdmins('Main Admin Locked', {
                    message: `Main admin ${email} has been locked after 3 failed login attempts.`
                });

                return res.status(401).json({ message: 'Account locked due to multiple failed attempts' });
            }

            await admin.save();
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Success
        admin.loginAttempts = 0;
        admin.lockUntil = undefined;
        await admin.save();

        const token = generateToken(admin);
        res.status(200).json({
            token,
            admin: { id: admin._id, name: admin.name, role: admin.role }
        });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// @desc    Manually Add Customer (Only by Admin)
const manuallyAddCustomer = async (req, res) => {
    try {
        if (!req.admin || !req.isSuperAdmin) {
            return res.status(403).json({ message: "Unauthorized: Only Super Admin can add users manually" });
        }

        const { name, email, phone, country, state, address1, address2, password } = req.body;



        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: "User already exists" });

        const newUserData = {
            name,
            email,
            phone,
            country,
            state,
            address1,
            address2,
            createdBy: "admin",
            isManual: true,
            role: 'user'
        };

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            newUserData.password = hashedPassword;
        }

        const newUser = await User.create(newUserData);
        res.status(201).json({ message: "Customer added successfully", user: newUser });
    } catch (err) {
        res.status(500).json({ message: "Error adding customer", error: err.message });
    }
};

const getAllCustomers = async (req, res) => {
    try {
        const customers = await User.find({ role: 'user' }).sort({ createdAt: -1 });
        res.status(200).json(customers);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch customers", error: err.message });
    }
};

export {
    userSignup,
    userLogin,
    adminLogin,
    manuallyAddCustomer,
    getAllCustomers
};
