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

// export const authenticateUser = async (req, res, next) => {
//     try {
//         const token = req.headers.authorization?.split(' ')[1];
//         if (!token) return res.status(401).json({ message: 'Unauthorized' });

//         const decoded = jwt.verify(token, JWT_SECRET);
//         const user = await User.findById(decoded.id);

//         if (!user || user.role !== 'user') {
//             return res.status(403).json({ message: 'Forbidden: Not a user' });
//         }

//         req.user = user;
//         next();
//     } catch (err) {
//         res.status(401).json({ message: 'Invalid Token', error: err.message });
//     }
// };
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
/* ===============================
   SELLER AUTHENTICATION
================================ */
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

export const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next(); // no token → guest
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (user) {
            req.user = user; // only attach if valid
        }
    } catch (err) {
        console.warn("⚠️ Invalid token, continuing as guest");
    }
    next();
};

export const verifyAdminOrTeamMember = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.warn("❌ No token provided");
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // ✅ SUPER ADMIN
        const mainAdmin = await Admin.findById(decoded.id);
        if (mainAdmin) {

            req.admin = mainAdmin;
            req.isSuperAdmin = true;
            req.adminId = decoded.id;

            // ✅ REQUIRED for Notification system
            req.user = {
                id: mainAdmin._id,
                email: mainAdmin.email,
                type: 'Admin',
            };

            return next();
        }

        // ✅ ADMIN ROLE ADMIN
        const roleAdmin = await AdminRoleAdmin.findById(decoded.id).populate('role');
        if (roleAdmin) {
            if (!roleAdmin.role || !roleAdmin.role._id) {
                console.error("❌ RoleAdmin has no valid role populated");
                return res.status(500).json({ message: 'Assigned role not found or not populated' });
            }

            console.log("✅ Authenticated as ROLE ADMIN:", roleAdmin.email);

            req.roleAdmin = roleAdmin;
            req.rolePermissions = roleAdmin.role.permissions;
            req.isRoleAdmin = true;

            req.user = {
                id: roleAdmin._id,
                email: roleAdmin.email,
                type: 'AdminRoleAdmin',
            };

            return next();
        }

        // ✅ TEAM MEMBER
        const teamMember = await TeamMember.findById(decoded.id).populate('role');
        if (teamMember) {
            console.log("✅ Authenticated as TEAM MEMBER:", teamMember.email);

            req.teamMember = teamMember;
            req.rolePermissions = teamMember.role.permissions;

            req.user = {
                id: teamMember._id,
                email: teamMember.email,
                type: 'TeamMember',
            };

            return next();
        }

        console.warn("❌ Invalid token or user not found");
        return res.status(403).json({ message: 'Invalid token or user not found' });
    } catch (err) {
        console.error("❌ JWT verification error:", err.message);
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

export const protect = authenticateUser;
export const isAdmin = verifyAdminOrTeamMember;
export const isSeller = authenticateSeller;   // seller only
