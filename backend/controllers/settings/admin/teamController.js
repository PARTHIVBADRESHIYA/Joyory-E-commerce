import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import TeamMember from '../../../models/settings/admin/TeamMember.js';
import AdminRole from '../../../models/settings/admin/AdminRole.js';
import mongoose from 'mongoose';
import { notifyMainAdmins } from '../../../middlewares/utils/notifyMainAdmins.js'; // ✅ Check path

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined in env");

// ✅ Register a team member (by AdminRoleAdmin ONLY)
export const registerTeamMember = async (req, res) => {
    try {
        const { name, email, password, role: roleId } = req.body;

        if (!roleId) {
            return res.status(400).json({ message: 'Role ID is required' });
        }

        // Validate roleId format
        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            return res.status(400).json({ message: 'Invalid role ID format' });
        }

        const role = await AdminRole.findById(roleId);
        if (!role) return res.status(404).json({ message: 'Admin role not found' });

        const currentCount = await TeamMember.countDocuments({ role: roleId });

        // Check duplicate email
        const existing = await TeamMember.findOne({ email });
        if (existing) return res.status(400).json({ message: 'Email already in use' });

        // console.log('req.roleAdmin?.role?._id.toString()', req.roleAdmin?.role?._id.toString());

        // ✅ Only AdminRoleAdmin of this role can add members
        if (req.roleAdmin && req.roleAdmin.role._id.toString() !== req.body.role.toString()) {
            return res.status(403).json({ message: 'You are not authorized to add members to this role' });
        }

        if (currentCount >= role.users) {
            return res.status(403).json({ message: `User limit (${role.users}) reached for this role.` });
        }

        const hashed = await bcrypt.hash(password, 10);

        const member = await TeamMember.create({
            name,
            email,
            password: hashed,
            role: roleId,
            createdBy: req.roleAdmin._id
        });

        res.status(201).json({ success: true, member });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(400).json({ success: false, error: err.message });
    }
};


// ✅ Login a team member
export const loginTeamMember = async (req, res) => {
    try {
        const { email, password } = req.body;

        const member = await TeamMember.findOne({ email }).populate('role');
        if (!member) return res.status(404).json({ message: 'Team member not found' });

        // 🔐 Check if account is locked
        if (member.lockUntil && member.lockUntil > new Date()) {
            const remaining = member.lockUntil - new Date();
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);

            return res.status(403).json({
                message: `Account locked. Try again in ${hours}h ${minutes}m ${seconds}s.`
            });
        }

        const isMatch = await bcrypt.compare(password, member.password);
        if (!isMatch) {
            member.loginAttempts = (member.loginAttempts || 0) + 1;

            if (member.loginAttempts >= 3) {
                member.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // Lock for 24 hrs
                member.loginAttempts = 0;
                await member.save();

                // ✅ Notify main admin only ONCE (when lock happens)
                await notifyMainAdmins('Team Member Locked', {
                    message: `Team member ${member.email} has been locked after 3 failed login attempts.`
                });

                return res.status(401).json({ message: 'Account locked due to multiple failed attempts' });
            }

            await member.save();
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // ✅ Success - reset attempts
        member.loginAttempts = 0;
        member.lockUntil = undefined;
        await member.save();

        const token = jwt.sign(
            { id: member._id, role: member.role._id },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(200).json({
            message: 'Team member logged in successfully',
            token,
            member: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: member.role
            }
        });

    } catch (err) {
        console.error('Team Login Error:', err);
        res.status(500).json({ message: 'Team login failed', error: err.message });
    }
};

// ✅ Get all team members (optionally only for current role admin)
export const getAllTeamMembers = async (req, res) => {
    try {
        let query = {};

        // If requested by a role admin, only show their team's members
        if (req.roleAdmin) {
            query = { role: req.roleAdmin.role };
        }

        const members = await TeamMember.find(query).populate('role');
        res.status(200).json({ success: true, members });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
