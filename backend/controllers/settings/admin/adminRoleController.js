import AdminRole from '../../../models/settings/admin/AdminRole.js';
import AdminRoleAdmin from '../../../models/settings/admin/AdminRoleAdmin.js';
import { ALL_PERMISSIONS } from '../../../permissions.js';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined in env");


// Create a role
export const createAdminRole = async (req, res) => {
    try {
        // Authorization: super-admin OR has 'settings:roles' permission
        if (!req.isSuperAdmin && !(Array.isArray(req.permissions) && req.permissions.includes('settings:roles'))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Missing permission (settings:roles)' });
        }

        const { roleName, description, maxUsers = 0, permissions = [] } = req.body;

        if (!roleName || !Array.isArray(permissions)) {
            return res.status(400).json({ success: false, message: 'roleName and permissions[] required' });
        }

        // Validate permissions
        const invalid = permissions.filter(p => !ALL_PERMISSIONS.includes(p));
        if (invalid.length > 0) {
            return res.status(400).json({ success: false, message: `Invalid permissions: ${invalid.join(', ')}` });
        }

        const existing = await AdminRole.findOne({ roleName });
        if (existing) return res.status(400).json({ success: false, message: 'Role already exists' });

        const newRole = await AdminRole.create({
            roleName,
            description,
            maxUsers,
            permissions,
            createdBy: req.admin?._id || req.roleAdmin?._id || null,
        });

        res.status(201).json({ success: true, data: newRole });
    } catch (err) {
        console.error('createAdminRole error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// List roles
export const getAllAdminRoles = async (req, res) => {
    try {
        const roles = await AdminRole.find().select('roleName description maxUsers permissions archived createdBy');
        res.status(200).json({ success: true, roles });
    } catch (err) {
        console.error('getAllAdminRoles error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get single role
export const getAdminRoleById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

        const role = await AdminRole.findById(id).populate('createdBy', 'name email');
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

        res.status(200).json({ success: true, role });
    } catch (err) {
        console.error('getAdminRoleById error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update role
export const updateAdminRole = async (req, res) => {
    try {
        // Authorization: super-admin OR has 'settings:roles' permission
        if (!req.isSuperAdmin && !(Array.isArray(req.permissions) && req.permissions.includes('settings:roles'))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Missing permission (settings:roles)' });
        }

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

        const allowed = ['roleName', 'description', 'maxUsers', 'permissions', 'archived'];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        const role = await AdminRole.findByIdAndUpdate(id, updates, { new: true });
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

        res.status(200).json({ success: true, role });
    } catch (err) {
        console.error('updateAdminRole error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Delete / archive role
export const deleteAdminRole = async (req, res) => {
    try {
        // Prefer soft-delete (archived). Only super admin should be able to hard delete.
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

        // If caller is super admin they can remove; else require permission
        if (!req.isSuperAdmin && !(Array.isArray(req.permissions) && req.permissions.includes('settings:roles'))) {
            return res.status(403).json({ success: false, message: 'Access Denied: Missing permission (settings:roles)' });
        }

        // Soft-archive
        const role = await AdminRole.findByIdAndUpdate(id, { archived: true }, { new: true });
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

        res.status(200).json({ success: true, role });
    } catch (err) {
        console.error('deleteAdminRole error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
