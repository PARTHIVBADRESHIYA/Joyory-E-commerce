import User from '../models/User.js';
import Admin from '../models/Admin.js';
import jwt from 'jsonwebtoken';

// Generate JWT Token
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
        const { name, email, password } = req.body;

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: 'Email already registered' });

        const user = await User.create({
            name,
            email,
            password,
            role: 'user',
            isManual: false,
        });

        const token = generateToken(user);
        res.status(201).json({ token, user: { id: user._id, name: user.name, role: user.role } });

    } catch (err) {
        res.status(500).json({ message: 'Signup failed', error: err.message });
    }
};

// @desc    User Login
const userLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || user.role !== 'user') return res.status(401).json({ message: 'Invalid credentials' });

        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = generateToken(user);
        res.status(200).json({ token, user: { id: user._id, name: user.name, role: user.role } });

    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// ====================== ADMIN SECTION ===================== //

// @desc    Admin Login
const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(401).json({ message: 'Admin not found' });

        const isMatch = await admin.matchPassword(password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid password' });

        const token = generateToken(admin);
        res.status(200).json({ token, admin: { id: admin._id, name: admin.name, role: admin.role } });

    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// @desc    Manually Add Customer (Only by Admin)
const manuallyAddCustomer = async (req, res) => {
    try {
        const authUser = req.user || req.admin; // Use authenticated admin from middleware
        if (!authUser || authUser.role !== 'admin') {
            return res.status(403).json({ message: "Unauthorized: Admin access required" });
        }

        const { name, email, phone, country, state, address1, address2 } = req.body;

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: "User already exists" });

        const newUser = await User.create({
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
        });

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
