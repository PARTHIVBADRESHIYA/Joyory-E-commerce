import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../../../models/Admin.js';
import TeamMember from '../../../models/settings/admin/TeamMember.js';
import AdminRole from '../../../models/settings/admin/AdminRole.js';
import AdminRoleAdmin from '../../../models/settings/admin/AdminRoleAdmin.js';
import { ALL_PERMISSIONS } from '../../../permissions.js';

import mongoose from 'mongoose';
import { notifyMainAdmins } from '../../../middlewares/utils/notifyMainAdmins.js'; // ✅ Check path
import { generateToken } from '../../../controllers/authController.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined in env");

export const registerTeamMember = async (req, res) => {
    try {
        const { name, email, password, role: roleId, permissionSubset = [] } = req.body;
        if (!name || !email || !password || !roleId)
            return res.status(400).json({ message: 'All fields required' });

        if (!mongoose.Types.ObjectId.isValid(roleId))
            return res.status(400).json({ message: 'Invalid role id' });

        const role = await AdminRole.findById(roleId);
        if (!role || role.archived)
            return res.status(404).json({ message: 'Role not available' });

        // Check email in all collections  
        const emailInSuperAdmin = await Admin.findOne({ email });
        const emailInRoleAdmin = await AdminRoleAdmin.findOne({ email });
        const emailInTeamMember = await TeamMember.findOne({ email });

        if (emailInSuperAdmin || emailInRoleAdmin || emailInTeamMember) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        // enforce maxUsers  
        if (role.maxUsers > 0) {
            const count = await TeamMember.countDocuments({ role: roleId });
            if (count >= role.maxUsers)
                return res.status(400).json({ message: `Role limit reached (${role.maxUsers})` });
        }

        // role admin cannot assign to another role  
        if (req.roleAdmin && String(req.roleAdmin.role._id) !== String(roleId) && !req.isSuperAdmin)
            return res.status(403).json({ message: 'Not authorized to add members to this role' });

        // team member cannot create  
        if (req.userType === 'TEAM_MEMBER')
            return res.status(403).json({ message: 'Team members cannot create users' });

        // validate permissionSubset
        const invalid = permissionSubset.filter(p => !ALL_PERMISSIONS.includes(p) || !role.permissions.includes(p));
        if (invalid.length > 0)
            return res.status(400).json({
                message: `Invalid permissions: ${invalid.join(', ')}`,
                allowed: role.permissions
            });

        const createdBy = req.roleAdmin?._id || req.admin?._id || null;

        const member = await TeamMember.create({
            name,
            email,
            password,
            role: roleId,
            permissionSubset,
            createdBy
        });

        res.status(201).json({
            success: true,
            member: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: role.roleName,
                permissionSubset
            }
        });

    } catch (err) {
        console.error('registerTeamMember error:', err);
        res.status(500).json({ success: false, error: err.message });
    }


};

export const loginTeamMember = async (req, res) => {
    try {
        const { email, password } = req.body;
        const member = await TeamMember.findOne({ email }).populate('role');
        if (!member) return res.status(404).json({ message: 'Team member not found' });

        if (member.lockUntil && member.lockUntil > new Date()) {
            const remaining = member.lockUntil - new Date();
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);
            return res.status(403).json({ message: `Account locked. Try again in ${hours}h ${minutes}m` });
        }

        const isMatch = await bcrypt.compare(password, member.password);
        if (!isMatch) {
            member.loginAttempts = (member.loginAttempts || 0) + 1;
            if (member.loginAttempts >= 3) {
                member.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
                member.loginAttempts = 0;
                await member.save();
                if (notifyMainAdmins) notifyMainAdmins('Team Member Locked', { message: `${email} locked` }).catch(() => { });
                return res.status(403).json({ message: 'Account locked due to multiple failed attempts' });
            }
            await member.save();
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // success
        member.loginAttempts = 0;
        member.lockUntil = undefined;
        await member.save();

        const token = generateToken({ id: member._id, type: 'TeamMember', role: member.role?._id });
        res.status(200).json({
            message: 'Team member logged in successfully',
            token,
            member: { id: member._id, name: member.name, email: member.email, role: member.role, permissions: member.permissionSubset }
        });

    } catch (err) {
        console.error('loginTeamMember error:', err);
        res.status(500).json({ message: 'Team login failed', error: err.message });
    }
};

// List team members (roleAdmin sees only their role; super admin sees all)
export const getAllTeamMembers = async (req, res) => {
    try {
        let query = {};
        if (req.roleAdmin && !req.isSuperAdmin) {
            query = { role: req.roleAdmin.role._id };
        }
        const members = await TeamMember.find(query).populate('role', 'roleName permissions');
        res.status(200).json({ success: true, members });
    } catch (err) {
        console.error('getAllTeamMembers error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getTeamMemberById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: 'Invalid id' });

        const member = await TeamMember.findById(id)
            .select('-password')
            .populate('role', 'roleName permissions');

        if (!member) return res.status(404).json({ message: 'Team member not found' });

        // Role Admin can only view members of their own role
        if (req.roleAdmin && !req.isSuperAdmin) {
            if (String(member.role._id) !== String(req.roleAdmin.role._id)) {
                return res.status(403).json({ message: 'Not authorized to view this member' });
            }
        }

        res.status(200).json({ success: true, member });

    } catch (err) {
        console.error('getTeamMemberById error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateTeamMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role: newRoleId, permissionSubset } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: 'Invalid id' });

        const member = await TeamMember.findById(id);
        if (!member) return res.status(404).json({ message: 'Team member not found' });

        // Role Admin cannot update members outside their own role
        if (req.roleAdmin && !req.isSuperAdmin) {
            if (String(member.role) !== String(req.roleAdmin.role._id)) {
                return res.status(403).json({ message: 'Not authorized to update this user' });
            }
        }

        // Email must be unique across all admin types
        if (email && email !== member.email) {
            const usedEmail =
                await Admin.findOne({ email }) ||
                await AdminRoleAdmin.findOne({ email }) ||
                await TeamMember.findOne({ email });

            if (usedEmail) return res.status(400).json({ message: 'Email already in use' });
        }

        // If role is changed, validate
        let selectedRole = null;
        if (newRoleId) {
            if (!mongoose.Types.ObjectId.isValid(newRoleId))
                return res.status(400).json({ message: 'Invalid role id' });

            selectedRole = await AdminRole.findById(newRoleId);
            if (!selectedRole || selectedRole.archived)
                return res.status(404).json({ message: 'Role not available' });

            // Role admin cannot move team member to another role
            if (req.roleAdmin && !req.isSuperAdmin) {
                if (String(req.roleAdmin.role._id) !== String(newRoleId)) {
                    return res.status(403).json({ message: 'Not allowed to change role' });
                }
            }

            // enforce maxUsers
            const count = await TeamMember.countDocuments({ role: newRoleId });
            if (selectedRole.maxUsers > 0 && count >= selectedRole.maxUsers) {
                return res.status(400).json({
                    message: `Role user limit reached (${selectedRole.maxUsers})`
                });
            }
        }

        // Validate permissionSubset
        if (permissionSubset) {
            const roleToCheck = selectedRole || member.role;
            const roleDoc = await AdminRole.findById(roleToCheck);

            const invalid = permissionSubset.filter(
                p => !ALL_PERMISSIONS.includes(p) || !roleDoc.permissions.includes(p)
            );
            if (invalid.length)
                return res.status(400).json({
                    message: `Invalid permissions: ${invalid.join(', ')}`,
                    allowed: roleDoc.permissions
                });
        }

        // Final update
        const updated = await TeamMember.findByIdAndUpdate(
            id,
            {
                ...(name && { name }),
                ...(email && { email }),
                ...(newRoleId && { role: newRoleId }),
                ...(permissionSubset && { permissionSubset })
            },
            { new: true }
        ).select('-password');

        res.status(200).json({ success: true, member: updated });

    } catch (err) {
        console.error('updateTeamMember error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};


export const deleteTeamMember = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: 'Invalid id' });

        const member = await TeamMember.findById(id);
        if (!member) return res.status(404).json({ message: 'Team member not found' });

        // Role Admin cannot delete users from other roles
        if (req.roleAdmin && !req.isSuperAdmin) {
            if (String(member.role) !== String(req.roleAdmin.role._id)) {
                return res.status(403).json({ message: 'Not authorized to delete this user' });
            }
        }

        await member.deleteOne();

        res.status(200).json({ success: true, message: 'Team member removed' });

    } catch (err) {
        console.error('deleteTeamMember error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
