import AdminRole from '../../../models/settings/admin/AdminRole.js';
import AdminRoleAdmin from '../../../models/settings/admin/AdminRoleAdmin.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined in env");


export const createAdminRole = async (req, res) => {
    try {
        const { roleName, description, users, permissions } = req.body;

        if (!roleName || typeof users !== 'number') {
            return res.status(400).json({ success: false, message: 'Invalid roleName or users count' });
        }

        const existing = await AdminRole.findOne({ roleName });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Role already exists' });
        }

        const newRole = new AdminRole({
            roleName,
            description,
            users,
            permissions,
            createdBy: req.adminId || req.roleAdmin?._id, // whoever is creating
        });

        await newRole.save();

        return res.status(201).json({ success: true, data: newRole });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};  

export const getAllAdminRoles = async (req, res) => {
    try {
        const roles = await AdminRole.find().select('roleName description users permissions');
        res.status(200).json({ success: true, roles });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getAdminRoleById = async (req, res) => {
    try {
        const role = await AdminRole.findById(req.params.id).populate('createdBy');
        res.status(200).json({ success: true, role });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateAdminRole = async (req, res) => {
    try {
        const role = await AdminRole.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, role });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteAdminRole = async (req, res) => {
    try {
        const role = await AdminRole.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, role });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
