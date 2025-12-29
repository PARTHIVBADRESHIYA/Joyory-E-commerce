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



import mongoose from 'mongoose';
import User from '../models/User.js';
import Admin from '../models/Admin.js';
import PendingUser from '../models/PendingAdmin.js';
import TeamMember from '../models/settings/admin/TeamMember.js';
import AdminRoleAdmin from '../models/settings/admin/AdminRoleAdmin.js';
import AdminRole from '../models/settings/admin/AdminRole.js';
import Product from '../models/Product.js';
import ProductViewLog from '../models/ProductViewLog.js';
import Order from '../models/Order.js';
import Seller from '../models/sellers/Seller.js';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { notifyMainAdmins } from '../middlewares/utils/notifyMainAdmins.js';
import { generateOTP } from '../middlewares/utils/generateOTP.js';
import { sendEmail } from '../middlewares/utils/emailService.js';
import { sendSms } from '../middlewares/utils/sendSms.js';

// // JWT Token Generator
// const generateToken = (user) => {
//     return jwt.sign(
//         { id: user._id, role: user.role },
//         process.env.JWT_SECRET,
//         { expiresIn: '7d' }
//     );
// };

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET not defined');

export const generateToken = ({ id, type = 'SUPER_ADMIN', role = null }, opts = {}) => {
    const payload = { id, type };
    if (role) payload.role = role;
    return jwt.sign(payload, JWT_SECRET, { expiresIn: opts.expiresIn || '1d' });
};


const registerSchema = Joi.object({
    userType: Joi.string().valid('SUPER_ADMIN', 'ROLE_ADMIN', 'TEAM_MEMBER').required(),
    name: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    roleId: Joi.string().allow('', null), // required for role admin & team member
    permissionSubset: Joi.array().items(Joi.string()).default([])
});

// const adminRegister = async (req, res) => {
//     try {
//         const { name, email, password } = req.body;

//         // Check if already a verified admin
//         const existingAdmin = await Admin.findOne({ email });
//         if (existingAdmin) {
//             return res.status(400).json({ message: 'Admin already exists' });
//         }

//         // Remove old pending record if it exists
//         await PendingAdmin.deleteOne({ email });

//         // Generate OTP
//         const otp = generateOTP();
//         const hashedOtp = await bcrypt.hash(otp, 10);

//         // Save in PendingAdmin collection
//         const pending = await PendingAdmin.create({
//             name,
//             email,
//             password,
//             otp: {
//                 code: hashedOtp,
//                 expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
//                 attemptsLeft: 3
//             }
//         });

//         // Send Email with OTP
//         await sendEmail(
//             email,
//             'Verify your admin account',
//             `<p>Your verification OTP is: <b>${otp}</b></p>`
//         );

//         res.status(201).json({
//             message: 'OTP sent to email. Please verify to complete registration.'
//         });
//     } catch (err) {
//         console.error('Admin Register Error:', err);
//         res.status(500).json({ message: 'Admin registration failed', error: err.message });
//     }
// };

// const adminLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         const admin = await Admin.findOne({ email });
//         if (!admin) return res.status(401).json({ message: 'Invalid credentials' });


//         const isMatch = await admin.matchPassword(password);

//         if (!isMatch) {
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         const token = generateToken(admin);
//         res.status(200).json({
//             token,
//             admin: { id: admin._id, name: admin.name, role: admin.role }
//         });
//     } catch (err) {
//         res.status(500).json({ message: 'Login failed', error: err.message });
//     }
// }



//completely working till 01/12/2025


// const adminRegister = async (req, res) => {
//     try {
//         const { name, email, password } = req.body;
//         if (!name || !email || !password)
//             return res.status(400).json({ message: 'Missing fields' });

//         const existing = await Admin.findOne({ email });
//         if (existing)
//             return res.status(400).json({ message: 'Admin already exists' });

//         // Check if this is the first admin
//         const isFirstAdmin = (await Admin.countDocuments()) === 0;

//         // Remove old pending
//         await PendingAdmin.deleteOne({ email });

//         const otp = generateOTP();
//         const hashedOtp = await bcrypt.hash(otp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         await PendingAdmin.create({
//             name,
//             email,
//             password: hashedPassword,
//             isSuperAdmin: isFirstAdmin,   // <<<< VERY IMPORTANT
//             otp: {
//                 code: hashedOtp,
//                 expiresAt: Date.now() + 10 * 60 * 1000,
//                 attemptsLeft: 3
//             }
//         });

//         await sendEmail(email, 'Verify Admin account', `<p>Your OTP: <b>${otp}</b></p>`);
//         return res.status(201).json({ message: 'OTP sent' });

//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ message: 'Registration failed', error: err.message });
//     }
// };

// const adminLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;
//         const admin = await Admin.findOne({ email });
//         if (!admin) return res.status(401).json({ message: 'Invalid credentials' });
//         if (!admin.isSuperAdmin) return res.status(403).json({ message: 'Not a super admin' });

//         const ok = await admin.matchPassword(password);
//         if (!ok) {
//             // increment attempts/lock logic (optional) — implement if you want
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         const token = generateToken({ id: admin._id, type: 'SUPER_ADMIN' }, { expiresIn: '7d' });
//         res.status(200).json({ message: 'Logged in', token, admin: { id: admin._id, email: admin.email, name: admin.name } });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ message: 'Login failed', error: err.message });
//     }
// };






// export const registerUnified = async (req, res) => {
//     try {
//         const { error, value } = registerSchema.validate(req.body);
//         if (error) return res.status(400).json({ success: false, message: error.details[0].message });

//         const { userType, name, email, password, roleId, permissionSubset } = value;

//         // global email uniqueness
//         const [inSuper, inRoleAdmin, inTeam] = await Promise.all([
//             Admin.findOne({ email }),
//             AdminRoleAdmin.findOne({ email }),
//             TeamMember.findOne({ email })
//         ]);
//         if (inSuper || inRoleAdmin || inTeam)
//             return res.status(400).json({ success: false, message: 'Email already in use' });

//         // CREATE SUPER ADMIN (only first time or super admin)
//         if (userType === 'SUPER_ADMIN') {
//             const isFirstAdmin = (await Admin.countDocuments()) === 0;
//             if (!isFirstAdmin && !req.isSuperAdmin) {
//                 return res.status(403).json({ success: false, message: 'Only super admin can create another super admin' });
//             }

//             const created = await Admin.create({ name, email, password, isSuperAdmin: true });

//             return res.status(201).json({ success: true, user: { id: created._id, name, email, type: 'SUPER_ADMIN' } });
//         }

//         // For ROLE_ADMIN & TEAM_MEMBER — just check roleId exists
//         if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) {
//             return res.status(400).json({ success: false, message: 'Valid roleId required' });
//         }

//         const role = await AdminRole.findById(roleId);
//         if (!role || role.archived)
//             return res.status(404).json({ success: false, message: 'Role not available' });

//         // CREATE ROLE ADMIN (NO authorization check now)
//         if (userType === 'ROLE_ADMIN') {
//             const admin = await AdminRoleAdmin.create({
//                 name,
//                 email,
//                 password,
//                 role: roleId
//             });

//             return res.status(201).json({
//                 success: true,
//                 user: { id: admin._id, name, email, type: 'ROLE_ADMIN', role: role.roleName }
//             });
//         }

//         // CREATE TEAM MEMBER (No special check)
//         if (userType === 'TEAM_MEMBER') {
//             const invalid = permissionSubset.filter(p => !role.permissions.includes(p));
//             if (invalid.length > 0) {
//                 return res.status(400).json({ success: false, message: `Permissions not allowed: ${invalid.join(', ')}` });
//             }

//             const member = await TeamMember.create({
//                 name,
//                 email,
//                 password,
//                 role: roleId,
//                 permissionSubset
//             });

//             return res.status(201).json({
//                 success: true,
//                 user: { id: member._id, name, email, type: 'TEAM_MEMBER', role: role.roleName }
//             });
//         }

//         return res.status(400).json({ success: false, message: 'Unknown userType' });

//     } catch (err) {
//         console.error('registerUnified error:', err);
//         return res.status(500).json({ success: false, error: err.message });
//     }
// };


export const registerUnified = async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error)
            return res.status(400).json({ success: false, message: error.details[0].message });

        const { userType, name, email, password, roleId, permissionSubset } = value;

        // 🔥 GLOBAL EMAIL UNIQUENESS CHECK (SuperAdmin, RoleAdmin, TeamMember, PendingUser)
        const [inSuper, inRoleAdmin, inTeam, inPending] = await Promise.all([
            Admin.findOne({ email }),
            AdminRoleAdmin.findOne({ email }),
            TeamMember.findOne({ email }),
            PendingUser.findOne({ email })
        ]);

        if (inSuper || inRoleAdmin || inTeam || inPending) {
            return res.status(400).json({
                success: false,
                message: "Email already in use"
            });
        }

        // Clean previous pending (optional but safe)
        await PendingUser.deleteOne({ email });

        // 🟦 SUPER ADMIN RULES
        const isFirstAdmin = (await Admin.countDocuments()) === 0;

        if (userType === "SUPER_ADMIN") {
            if (!isFirstAdmin && !req.isSuperAdmin) {
                return res.status(403).json({
                    success: false,
                    message: "Only super admin can create another super admin"
                });
            }
        }

        // 🟩 ROLE_ADMIN / TEAM_MEMBER RULES
        if (["ROLE_ADMIN", "TEAM_MEMBER"].includes(userType)) {
            if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) {
                return res.status(400).json({ success: false, message: "Valid roleId required" });
            }

            const role = await AdminRole.findById(roleId);
            if (!role || role.archived)
                return res.status(404).json({ success: false, message: "Role not available" });

            if (userType === "TEAM_MEMBER") {
                const invalid = permissionSubset.filter(
                    p => !role.permissions.includes(p)
                );
                if (invalid.length)
                    return res.status(400).json({
                        success: false,
                        message: `Permissions not allowed: ${invalid.join(", ")}`
                    });
            }
        }

        // 🟨 GENERATE OTP + HASH PASSWORD
        const otp = generateOTP();
        const hashedOtp = await bcrypt.hash(otp, 10);

        // 🟧 CREATE PENDING USER ENTRY
        await PendingUser.create({
            userType,
            name,
            email,
            password,
            roleId,
            permissionSubset,
            otp: {
                code: hashedOtp,
                expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
                attemptsLeft: 5
            }
        });

        // SEND OTP EMAIL
        await sendEmail(
            email,
            "Verify your account",
            `<p>Your OTP: <b>${otp}</b></p>`
        );

        return res.status(201).json({
            success: true,
            message: "OTP sent. Verify to continue."
        });

    } catch (err) {
        console.error("registerUnified error:", err);
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

export const loginUnified = async (req, res) => {
    try {
        const schema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() });
        const { error, value } = schema.validate(req.body);
        if (error) return res.status(400).json({ success: false, message: error.details[0].message });

        const { email, password } = value;

        // find in role admin and team member and super admin in parallel
        const [superAdmin, roleAdmin, teamMember] = await Promise.all([
            Admin.findOne({ email }),
            AdminRoleAdmin.findOne({ email }).populate('role'),
            TeamMember.findOne({ email }).populate('role')
        ]);

        // helper to create token
        const createToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        // 1) Super admin
        if (superAdmin) {
            const ok = await bcrypt.compare(password, superAdmin.password);
            if (!ok) {
                // increment lock/attempts as needed
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }
            const token = createToken({ id: superAdmin._id, type: 'SUPER_ADMIN' });
            return res.status(200).json({
                success: true, token, user: {
                    id: superAdmin._id, name: superAdmin.name, email: superAdmin.email, type: 'SUPER_ADMIN', permissions: "ALL" // ⭐ so front-end knows unlimited access
                }
            });
        }

        // 2) Role admin
        if (roleAdmin) {
            const ok = await bcrypt.compare(password, roleAdmin.password);
            if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
            const token = createToken({ id: roleAdmin._id, type: 'ADMIN_ROLE_ADMIN', role: roleAdmin.role?._id });
            return res.status(200).json({
                success: true, token, user: {
                    id: roleAdmin._id, name: roleAdmin.name, email: roleAdmin.email, type: 'ADMIN_ROLE_ADMIN', role: roleAdmin.role, permissions: roleAdmin.role.permissions   // ⭐ add this
                }
            });
        }

        // 3) Team member
        if (teamMember) {
            const ok = await bcrypt.compare(password, teamMember.password);
            if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
            const token = createToken({ id: teamMember._id, type: 'TEAM_MEMBER', role: teamMember.role?._id });
            return res.status(200).json({ success: true, token, user: { id: teamMember._id, name: teamMember.name, email: teamMember.email, type: 'TEAM_MEMBER', role: teamMember.role, permissions: teamMember.permissionSubset } });
        }

        return res.status(404).json({ success: false, message: 'User not found' });

    } catch (err) {
        console.error('loginUnified error:', err);
        return res.status(500).json({ success: false, error: err.message });
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



// @desc    Get all users (for admin)


const getAllUsers = async (req, res) => {
    try {
        // ----------- Filters from query ----------
        const {
            search,       // search by name or email
            minSpent,
            maxSpent,
            minOrders,
            maxOrders,
            startDate,    // registration start
            endDate,      // registration end
            sortBy = 'createdAt', // default sort
            sortOrder = 'desc',   // asc or desc
            page = 1,
            limit = 20
        } = req.query;

        // Build user query
        const query = { role: 'user' };
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const users = await User.find(query)
            .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .select('name email profileImage addresses createdAt');

        // Compute ordersCount and totalSpent per user
        const userData = await Promise.all(
            users.map(async (user) => {
                const orders = await Order.find({
                    user: user._id,
                    paymentStatus: 'success',
                    orderStatus: { $nin: ['Cancelled'] }
                }).select('amount');

                const totalSpent = orders.reduce((sum, o) => sum + (o.amount || 0), 0);

                return {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    profileImage: user.profileImage,
                    addresses: user.addresses || [],
                    ordersCount: orders.length,
                    spent: totalSpent,
                    createdAt: user.createdAt
                };
            })
        );

        // Apply min/max filters after calculation
        const filteredData = userData.filter(u => {
            if (minSpent && u.spent < Number(minSpent)) return false;
            if (maxSpent && u.spent > Number(maxSpent)) return false;
            if (minOrders && u.ordersCount < Number(minOrders)) return false;
            if (maxOrders && u.ordersCount > Number(maxOrders)) return false;
            return true;
        });

        return res.status(200).json({
            page: Number(page),
            limit: Number(limit),
            total: filteredData.length,
            users: filteredData
        });

    } catch (err) {
        return res.status(500).json({ message: 'Failed to fetch users', error: err.message });
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
    // adminRegister,
    // adminLogin,
    manuallyAddCustomer,
    getAllUsers,
    getUserById,
    updateUserByAdmin,
    deleteUser

};
