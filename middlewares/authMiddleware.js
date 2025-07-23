import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Admin from '../models/Admin.js';
import TeamMember from '../models/settings/admin/TeamMember.js';
import AdminRoleAdmin from '../models/settings/admin/AdminRoleAdmin.js';
import Order from '../models/Order.js';

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
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || user.role !== 'user') {
            return res.status(403).json({ message: 'Forbidden: Not a user' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid Token', error: err.message });
    }
};

// const verifyAdminOrTeamMember = async (req, res, next) => {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//         return res.status(401).json({ message: 'Unauthorized admin: No token' });
//     }

//     const token = authHeader.split(' ')[1];

//     try {
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         const admin = await Admin.findById(decoded.id);

//         if (!admin) {
//             return res.status(401).json({ message: 'Unauthorized admin: Invalid token' });
//         }

//         req.admin = admin;
//         next();
//     } catch (err) {
//         res.status(401).json({ message: 'Unauthorized admin: Token error', error: err.message });
//     }
// };

// export { authenticateUser, verifyAdminOrTeamMember };


export const verifyAdminOrTeamMember = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // ✅ SUPER ADMIN
        const mainAdmin = await Admin.findById(decoded.id);
        if (mainAdmin) {
            req.admin = mainAdmin;
            req.isSuperAdmin = true;
            req.adminId = decoded.id;
            return next();
        }

        // ✅ ADMIN ROLE ADMIN — IMPORTANT: Populate the role
        const roleAdmin = await AdminRoleAdmin.findById(decoded.id).populate('role');
        if (roleAdmin) {
            if (!roleAdmin.role || !roleAdmin.role._id) {
                return res.status(500).json({ message: 'Assigned role not found or not populated' });
            }

            req.roleAdmin = roleAdmin;
            req.rolePermissions = roleAdmin.role.permissions;
            req.isRoleAdmin = true;
            return next();
        }

        // ✅ TEAM MEMBER
        const teamMember = await TeamMember.findById(decoded.id).populate('role');
        if (teamMember) {
            req.teamMember = teamMember;
            req.rolePermissions = teamMember.role.permissions;
            return next();
        }

        return res.status(403).json({ message: 'Invalid token or user not found' });
    } catch (err) {
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
