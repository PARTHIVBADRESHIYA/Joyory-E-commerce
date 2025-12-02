import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Admin from '../models/Admin.js';
import TeamMember from '../models/settings/admin/TeamMember.js';
import AdminRoleAdmin from '../models/settings/admin/AdminRoleAdmin.js';
import Order from '../models/Order.js';
import Seller from "../models/sellers/Seller.js";

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined in env");
;

export const verifyOrderOwnership = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { orderId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (!order || !order.user) {
            return res.status(400).json({ message: "Order not found or user missing" });
        }

        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized payment attempt' });
        }

        req.order = order; // Pass order along
        next();
    } catch (err) {
        res.status(500).json({ message: 'Error verifying ownership', error: err.message });
    }
};

export const authenticateUser = async (req, res, next) => {
    try {
        // ✅ Read token from cookie
        const token = req.cookies?.token;
        if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });

        // ✅ Verify JWT
        const decoded = jwt.verify(token, JWT_SECRET);

        // ✅ Fetch user
        const user = await User.findById(decoded.id);
        if (!user || user.role !== 'user') {
            return res.status(403).json({ message: 'Forbidden: Not a user' });
        }

        // ✅ Attach user to request
        req.user = user;
        next();
    } catch (err) {
        console.error("❌ JWT verification failed:", err.message);
        return res.status(401).json({ message: 'Invalid token', error: err.message });
    }
};

export const authenticateSeller = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ message: "Unauthorized" });

        const decoded = jwt.verify(token, JWT_SECRET);

        const seller = await Seller.findById(decoded.id);
        if (!seller) return res.status(403).json({ message: "Seller not found" });

        req.seller = seller;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token", error: err.message });
    }
};


// export const verifyAdminOrTeamMember = async (req, res, next) => {
//     const token = req.headers.authorization?.split(' ')[1];
//     if (!token) {
//         console.warn("❌ No token provided");
//         return res.status(401).json({ message: 'Unauthorized: No token provided' });
//     }

//     try {
//         const decoded = jwt.verify(token, JWT_SECRET);
//         // ✅ SUPER ADMIN
//         const mainAdmin = await Admin.findById(decoded.id);
//         if (mainAdmin) {

//             req.admin = mainAdmin;
//             req.isSuperAdmin = true;
//             req.adminId = decoded.id;

//             // ✅ REQUIRED for Notification system
//             req.user = {
//                 id: mainAdmin._id,
//                 email: mainAdmin.email,
//                 type: 'Admin',
//             };

//             return next();
//         }

//         // ✅ ADMIN ROLE ADMIN
//         const roleAdmin = await AdminRoleAdmin.findById(decoded.id).populate('role');
//         if (roleAdmin) {
//             if (!roleAdmin.role || !roleAdmin.role._id) {
//                 console.error("❌ RoleAdmin has no valid role populated");
//                 return res.status(500).json({ message: 'Assigned role not found or not populated' });
//             }

//             console.log("✅ Authenticated as ROLE ADMIN:", roleAdmin.email);

//             req.roleAdmin = roleAdmin;
//             req.rolePermissions = roleAdmin.role.permissions;
//             req.isRoleAdmin = true;

//             req.user = {
//                 id: roleAdmin._id,
//                 email: roleAdmin.email,
//                 type: 'AdminRoleAdmin',
//             };

//             return next();
//         }

//         // ✅ TEAM MEMBER
//         const teamMember = await TeamMember.findById(decoded.id).populate('role');
//         if (teamMember) {
//             console.log("✅ Authenticated as TEAM MEMBER:", teamMember.email);

//             req.teamMember = teamMember;
//             req.rolePermissions = teamMember.role.permissions;

//             req.user = {
//                 id: teamMember._id,
//                 email: teamMember.email,
//                 type: 'TeamMember',
//             };

//             return next();
//         }

//         console.warn("❌ Invalid token or user not found");
//         return res.status(403).json({ message: 'Invalid token or user not found' });
//     } catch (err) {
//         console.error("❌ JWT verification error:", err.message);
//         return res.status(401).json({ message: 'Invalid token', error: err.message });
//     }
// };


export const checkPermission = (requiredPermission) => async (req, res, next) => {
    try {
        if (req.isSuperAdmin) return next();

        let permissions = [];

        if (req.userType === 'ADMIN_ROLE_ADMIN' && req.roleAdmin?.role) {
            permissions = req.roleAdmin.role.permissions || [];
        }

        if (req.userType === 'TEAM_MEMBER') {
            const rolePermissions = req.teamMember.role?.permissions || [];
            const subset = req.teamMember.permissionSubset || [];

            // final allowed permissions for team member
            permissions = subset.filter(p => rolePermissions.includes(p));
        }

        if (!permissions.includes(requiredPermission)) {
            return res.status(403).json({
                message: `Access Denied: Missing permission (${requiredPermission})`
            });
        }

        return next();
    } catch (err) {
        console.error('checkPermission error:', err.message);
        return res.status(500).json({ message: 'Permission check error', error: err.message });
    }
};

export const verifyAdminOrTeamMember = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // If token contains type, trust it first (preferred)
        if (decoded.type === 'SUPER_ADMIN' || decoded.type === 'SUPERADMIN') {
            const admin = await Admin.findById(decoded.id);
            if (!admin || !admin.isSuperAdmin) return res.status(403).json({ message: 'Invalid super admin' });

            req.userType = 'SUPER_ADMIN';
            req.isSuperAdmin = true;
            req.user = { id: admin._id, email: admin.email };
            req.permissions = 'ALL';
            return next();
        }

        if (decoded.type === 'ADMIN_ROLE_ADMIN') {
            const roleAdmin = await AdminRoleAdmin.findById(decoded.id).populate('role');
            if (!roleAdmin) return res.status(403).json({ message: 'Invalid role admin' });

            req.userType = 'ADMIN_ROLE_ADMIN';
            req.roleAdmin = roleAdmin;
            req.user = { id: roleAdmin._id, email: roleAdmin.email };
            req.permissions = Array.isArray(roleAdmin.role?.permissions) ? roleAdmin.role.permissions : [];

            req.isSuperAdmin = false;   // <-- REQUIRED FIX
            return next();
        }


        if (decoded.type === 'TEAM_MEMBER') {
            const tm = await TeamMember.findById(decoded.id).populate('role');
            if (!tm) return res.status(403).json({ message: 'Invalid team member' });

            req.userType = 'TEAM_MEMBER';
            req.teamMember = tm;
            req.user = { id: tm._id, email: tm.email };

            const rolePermissions = tm.role?.permissions || [];
            const subset = tm.permissionSubset || [];
            req.permissions = subset.filter(p => rolePermissions.includes(p));

            req.isSuperAdmin = false;  // <-- REQUIRED FIX
            return next();
        }


        // fallback: try to detect by existence
        // check super admin by id
        const admin = await Admin.findById(decoded.id);
        if (admin && admin.isSuperAdmin) {
            req.userType = 'SUPER_ADMIN';
            req.isSuperAdmin = true;
            req.user = { id: admin._id, email: admin.email };
            req.permissions = 'ALL';
            return next();
        }

        // role admin fallback
        const roleAdmin = await AdminRoleAdmin.findById(decoded.id).populate('role');
        if (roleAdmin) {
            req.userType = 'ADMIN_ROLE_ADMIN';
            req.roleAdmin = roleAdmin;
            req.user = { id: roleAdmin._id, email: roleAdmin.email };
            req.permissions = Array.isArray(roleAdmin.role?.permissions) ? roleAdmin.role.permissions : [];
            return next();
        }

        // team member fallback
        const teamMember = await TeamMember.findById(decoded.id).populate('role');
        if (teamMember) {
            req.userType = 'TEAM_MEMBER';
            req.teamMember = teamMember;
            req.user = { id: teamMember._id, email: teamMember.email };
            req.permissions = Array.isArray(teamMember.role?.permissions) ? teamMember.role.permissions : [];
            return next();
        }

        return res.status(403).json({ message: 'Invalid token or user not found' });

    } catch (err) {
        console.error('verifyAdminOrTeamMember error:', err.message);
        return res.status(401).json({ message: 'Invalid token', error: err.message });
    }
};

export const verifyRoleAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'No token provided' });

        const decoded = jwt.verify(token, JWT_SECRET);

        // ✅ POPULATE the role (very important!)
        const roleAdmin = await AdminRoleAdmin.findById(decoded.id).populate('role');
        if (!roleAdmin) return res.status(401).json({ message: 'Unauthorized' });

        // ✅ Ensure role is populated and available
        if (!roleAdmin.role || !roleAdmin.role._id) {
            return res.status(500).json({ message: 'AdminRoleAdmin has no assigned role' });
        }

        req.roleAdmin = roleAdmin;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token', error: err.message });
    }
};

export const optionalAuth = async (req, res, next) => {
    try {
        const token = req.cookies?.token;
        if (!token) return next(); // guest

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.id) return next();

        const user = await User.findById(decoded.id).select("-password");
        if (user) req.user = user;

    } catch (err) {
        console.warn("⚠️ Invalid JWT, continuing as guest");
    }
    next();
};

export const guestSession = (req, res, next) => {
    try {
        if (req.user?._id) return next(); // logged-in user

        if (!req.session.guestId) {
            req.session.guestId = new mongoose.Types.ObjectId().toString();
        }

        req.guestId = req.session.guestId;
        res.setHeader("x-guest-id", req.guestId);

        if (!Array.isArray(req.session.guestCart)) {
            req.session.guestCart = [];
        }

        req.guestCart = req.session.guestCart;
        next();
    } catch (err) {
        console.error("guestSession middleware error:", err);
        next();
    }
};

export const protect = authenticateUser;
export const isAdmin = verifyAdminOrTeamMember;
export const isSeller = authenticateSeller;   // seller only
