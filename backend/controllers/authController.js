// import User from '../models/User.js';
// import Admin from '../models/Admin.js';
// import Order from '../models/Order.js';

// import jwt from 'jsonwebtoken';
// import bcrypt from 'bcryptjs';
// import { notifyMainAdmins } from '../middlewares/utils/notifyMainAdmins.js'; // ✅ Make sure this path is correct

// // JWT Token Generator
// const generateToken = (user) => {
//     return jwt.sign(
//         { id: user._id, role: user.role },
//         process.env.JWT_SECRET,
//         { expiresIn: '7d' }
//     );
// };

// // ====================== ADMIN SECTION ===================== //

// const adminRegister = async (req, res) => {
//     try {
//         const { name, email, password } = req.body;

//         const existing = await Admin.findOne({ email });
//         if (existing) return res.status(400).json({ message: 'Admin already exists' });

//         const admin = new Admin({ name, email, password });
//         await admin.save();

//         res.status(201).json({ message: 'Admin created successfully' });
//     } catch (err) {
//         console.error('Admin Register Error:', err);
//         res.status(500).json({ message: 'Admin creation failed', error: err.message });
//     }
// }

// // @desc    Admin Login (3 attempts → 24hr lock, notify only on lock)
// const adminLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         const admin = await Admin.findOne({ email });
//         if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

//         // Check lock
//         if (admin.lockUntil && admin.lockUntil > new Date()) {
//             const remaining = admin.lockUntil - new Date();
//             const h = Math.floor(remaining / 3600000);
//             const m = Math.floor((remaining % 3600000) / 60000);
//             const s = Math.floor((remaining % 60000) / 1000);
//             return res.status(403).json({ message: `Account locked. Try again in ${h}h ${m}m ${s}s.` });
//         }

//         const isMatch = await admin.matchPassword(password);
//         if (!isMatch) {
//             admin.loginAttempts = (admin.loginAttempts || 0) + 1;

//             if (admin.loginAttempts >= 3) {
//                 admin.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hrs
//                 admin.loginAttempts = 0;
//                 await admin.save();

//                 // ✅ Notify main admin only when locked
//                 await notifyMainAdmins('Main Admin Locked', {
//                     message: `Main admin ${email} has been locked after 3 failed login attempts.`
//                 });

//                 return res.status(401).json({ message: 'Account locked due to multiple failed attempts' });
//             }

//             await admin.save();
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         // Success
//         admin.loginAttempts = 0;
//         admin.lockUntil = undefined;
//         await admin.save();

//         const token = generateToken(admin);
//         res.status(200).json({
//             token,
//             admin: { id: admin._id, name: admin.name, role: admin.role }
//         });
//     } catch (err) {
//         res.status(500).json({ message: 'Login failed', error: err.message });
//     }
// };




import User from '../models/User.js';
import Admin from '../models/Admin.js';
import PendingAdmin from '../models/PendingAdmin.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { notifyMainAdmins } from '../middlewares/utils/notifyMainAdmins.js';
import { generateOTP } from '../middlewares/utils/generateOTP.js';
import { sendEmail } from '../middlewares/utils/emailService.js';
import { sendSms } from '../middlewares/utils/sendSms.js';

// JWT Token Generator
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// ====================== ADMIN SECTION ===================== //
// const adminRegister = async (req, res) => {
//     try {
//         const { name, email, password } = req.body;

//         const existing = await Admin.findOne({ email });
//         if (existing) return res.status(400).json({ message: 'Admin already exists' });

//         // Create Admin
//         const admin = await Admin.create({
//             name,
//             email,
//             password,
//             isVerified: false
//         });

//         // Generate OTP
//         const otp = generateOTP();
//         const hashedOtp = await bcrypt.hash(otp, 10);

//         admin.otp = {
//             code: hashedOtp,
//             expiresAt: new Date(Date.now() + 10 * 60 * 1000),
//             attemptsLeft: 3
//         };
//         admin.otpRequests = [new Date()];
//         await admin.save();

//         // Send Email
//         await sendEmail(
//             admin.email,
//             'Verify your admin account',
//             `<p>Your verification OTP is: <b>${otp}</b></p>`
//         );

//         res.status(201).json({
//             message: 'Admin created successfully. OTP sent to email for verification.'
//         });
//     } catch (err) {
//         console.error('Admin Register Error:', err);
//         res.status(500).json({ message: 'Admin creation failed', error: err.message });
//     }
// };

const adminRegister = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if already a verified admin
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({ message: 'Admin already exists' });
        }

        // Remove old pending record if it exists
        await PendingAdmin.deleteOne({ email });

        // Generate OTP
        const otp = generateOTP();
        const hashedOtp = await bcrypt.hash(otp, 10);

        // Save in PendingAdmin collection
        const pending = await PendingAdmin.create({
            name,
            email,
            password,
            otp: {
                code: hashedOtp,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
                attemptsLeft: 3
            }
        });

        // Send Email with OTP
        await sendEmail(
            email,
            'Verify your admin account',
            `<p>Your verification OTP is: <b>${otp}</b></p>`
        );

        res.status(201).json({
            message: 'OTP sent to email. Please verify to complete registration.'
        });
    } catch (err) {
        console.error('Admin Register Error:', err);
        res.status(500).json({ message: 'Admin registration failed', error: err.message });
    }
};

const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(401).json({ message: 'Invalid credentials' });


        const isMatch = await admin.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = generateToken(admin);
        res.status(200).json({
            token,
            admin: { id: admin._id, name: admin.name, role: admin.role }
        });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
}




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

// @desc    Get all users (for admin)
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch users', error: err.message });
    }
};

// @desc    Get user by ID (for admin)
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving user', error: err.message });
    }
};

// @desc    Update user by admin
const updateUserByAdmin = async (req, res) => {
    try {
        const updates = req.body;
        const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!updatedUser) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({ message: 'User updated', user: updatedUser });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update user', error: err.message });
    }
};

// @desc    Delete user by admin
const deleteUser = async (req, res) => {
    try {
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete user', error: err.message });
    }
};

// @desc    Get user analytics (orders, income, etc)
const getUserAnalytics = async (req, res) => {
    try {
        const userId = req.params.id;
        const orders = await Order.find({ user: userId });

        if (!orders.length) {
            return res.status(404).json({ message: "No orders found for this user" });
        }

        let totalSpent = 0;
        let totalItemsOrdered = 0;
        let totalDiscountUsed = 0;
        let refunds = 0;
        let cancelled = 0;
        let lastOrderDate = null;

        const statusBreakdown = {};
        const paymentTypeBreakdown = {};

        for (const order of orders) {
            totalSpent += order.amount || 0;
            totalDiscountUsed += order.discountAmount || 0;
            lastOrderDate = !lastOrderDate || new Date(order.date) > new Date(lastOrderDate)
                ? order.date
                : lastOrderDate;

            for (const item of order.products) {
                totalItemsOrdered += item.quantity;
            }

            if (order.refund?.isRefunded) refunds++;
            if (order.status === 'Cancelled') cancelled++;

            statusBreakdown[order.status] = (statusBreakdown[order.status] || 0) + 1;
            paymentTypeBreakdown[order.orderType] = (paymentTypeBreakdown[order.orderType] || 0) + 1;
        }

        const averageOrderValue = parseFloat((totalSpent / orders.length).toFixed(2));

        const stats = {
            totalOrders: orders.length,
            totalSpent,
            totalItemsOrdered,
            totalDiscountUsed,
            refunds,
            cancelled,
            lastOrderDate,
            averageOrderValue,
            statusBreakdown,
            paymentTypeBreakdown
        };

        res.status(200).json(stats);

    } catch (err) {
        console.error("🔥 Error fetching user analytics:", err);
        res.status(500).json({ message: 'Failed to fetch analytics', error: err.message });
    }
};

// ✅ Full customer analytics (for admin dashboard)
const getFullCustomerAnalytics = async (req, res) => {
    try {
        const [totalCustomers, incomeAgg, monthlySpend, refundOrders] = await Promise.all([

            // Total customers
            User.countDocuments({ role: "user" }),

            // Total income (Delivered + Completed orders)
            Order.aggregate([
                { $match: { status: { $in: ["Delivered", "Completed"] } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),

            // Monthly spend
            Order.aggregate([
                { $match: { status: { $in: ["Delivered", "Completed"] } } },
                {
                    $group: {
                        _id: {
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        },
                        totalSpend: { $sum: "$amount" },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { "_id.year": 1, "_id.month": 1 } }
            ]),

            // Refunds
            Order.find({ "refund.isRefunded": true }, { refund: 1 })
        ]);

        // Refund calculations
        const refundCount = refundOrders.length;
        const totalRefundAmount = refundOrders.reduce(
            (sum, order) => sum + (order.refund?.refundAmount || 0),
            0
        );

        res.status(200).json({
            totalCustomers,
            totalIncome: incomeAgg.length ? incomeAgg[0].total : 0,
            monthlySpend,
            refundCount,
            totalRefundAmount
        });

    } catch (err) {
        console.error("🔥 Error in getFullCustomerAnalytics:", err);
        res.status(500).json({ error: err.message });
    }
};


export const listSellers = async (req, res) => {
    const q = {};
    if (req.query.status) q.status = req.query.status;
    const sellers = await Seller.find(q).populate('user').sort({ createdAt: -1 });
    res.json(sellers);
};

export const changeSellerStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const seller = await Seller.findByIdAndUpdate(id, { status }, { new: true });
    res.json({ message: 'Status updated', seller });
};

export const approveProduct = async (req, res) => {
    const { productId } = req.params;
    const product = await Product.findByIdAndUpdate(productId, { status: 'In-stock' }, { new: true });
    res.json({ message: 'Product approved', product });
};

export {
    adminRegister,
    adminLogin,
    manuallyAddCustomer,
    getAllUsers,
    getUserById,
    updateUserByAdmin,
    deleteUser,
    getUserAnalytics,
    getFullCustomerAnalytics
};
