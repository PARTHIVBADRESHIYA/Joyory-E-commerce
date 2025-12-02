import { PERMISSIONS, ALL_PERMISSIONS } from "../permissions.js";
import CustomPermission from "../models/CustomPermission.js";
import mongoose from "mongoose";
import AdminRole from "../models/settings/admin/AdminRole.js";
// 🔹 GET ALL PERMISSIONS (Static + Custom)
// 🔹 GET ALL PERMISSIONS (Static + Custom) — GROUPED BY MODULE
export const getAllPermissions = async (req, res) => {
    try {
        const custom = await CustomPermission.find();

        const grouped = {};

        // Add STATIC permissions grouped by module
        for (const moduleName in PERMISSIONS) {
            grouped[moduleName] = Object.entries(PERMISSIONS[moduleName]).map(
                ([label, key]) => ({
                    key,
                    label
                })
            );
        }

        // Add CUSTOM permissions grouped by module
        custom.forEach(p => {
            if (!grouped[p.module]) grouped[p.module] = [];
            grouped[p.module].push({ key: p.key, label: p.label });
        });

        return res.status(200).json({
            success: true,
            groupedPermissions: grouped,  // grouped nicely by module
            staticPermissions: PERMISSIONS,
            customPermissions: custom,
            all: Object.values(grouped).flat().map(p => p.key) // clean flat list
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};


// 🔹 GET PERMISSIONS GROUPED BY MODULE
export const getPermissionModules = async (req, res) => {
    try {
        const custom = await CustomPermission.find();

        const modules = { ...PERMISSIONS };

        custom.forEach(p => {
            if (!modules[p.module]) modules[p.module] = {};
            modules[p.module][p.label] = p.key;
        });

        return res.status(200).json({ success: true, modules });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 🔹 VALIDATE PERMISSION EXISTS
export const validatePermission = async (req, res) => {
    try {
        const { key } = req.params;

        const existsStatic = ALL_PERMISSIONS.includes(key);
        const existsCustom = await CustomPermission.findOne({ key });

        return res.status(200).json({
            success: true,
            exists: !!(existsStatic || existsCustom)
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 🔹 CREATE CUSTOM PERMISSION
export const createCustomPermission = async (req, res) => {
    try {
        const { key, label, module } = req.body;

        if (!key || !label || !module)
            return res.status(400).json({ success: false, message: "Key, label & module required" });

        // Cannot duplicate static permissions
        if (ALL_PERMISSIONS.includes(key))
            return res.status(400).json({ success: false, message: "Permission already exists (static)" });

        const exists = await CustomPermission.findOne({ key });
        if (exists)
            return res.status(400).json({ success: false, message: "Permission already exists" });

        const created = await CustomPermission.create({ key, label, module });

        return res.status(201).json({ success: true, permission: created });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 🔹 UPDATE CUSTOM PERMISSION
export const updateCustomPermission = async (req, res) => {
    try {
        const { key } = req.params;
        const { label, module } = req.body;

        const perm = await CustomPermission.findOne({ key });
        if (!perm)
            return res.status(404).json({ success: false, message: "Custom permission not found" });

        if (label) perm.label = label;
        if (module) perm.module = module;

        await perm.save();

        return res.status(200).json({ success: true, permission: perm });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 🔹 DELETE CUSTOM PERMISSION
export const deleteCustomPermission = async (req, res) => {
    try {
        const { key } = req.params;

        const perm = await CustomPermission.findOneAndDelete({ key });
        if (!perm)
            return res.status(404).json({ success: false, message: "Custom permission not found" });

        return res.status(200).json({ success: true, message: "Permission deleted" });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const getRolePermissions = async (req, res) => {
    try {
        const { roleId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid roleId"
            });
        }

        const role = await AdminRole.findById(roleId).lean();

        if (!role || role.archived) {
            return res.status(404).json({
                success: false,
                message: "Role not found"
            });
        }

        return res.status(200).json({
            success: true,
            roleId,
            permissions: role.permissions
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
