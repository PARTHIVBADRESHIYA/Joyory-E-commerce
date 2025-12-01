import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import AdminRoleAdmin from '../../../models/settings/admin/AdminRoleAdmin.js';
import AdminRole from '../../../models/settings/admin/AdminRole.js';
import Admin from '../../../models/Admin.js';
import TeamMember from '../../../models/settings/admin/TeamMember.js';
import mongoose from 'mongoose';
import { notifyMainAdmins } from '../../../middlewares/utils/notifyMainAdmins.js';
import { generateToken } from '../../../controllers/authController.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined in env");
;
// Register a new AdminRoleAdmin
export const registerRoleAdmin = async (req, res) => {
try {
const { name, email, password, roleId } = req.body;

    if (!name || !email || !password || !roleId) {  
        return res.status(400).json({ success: false, message: "All fields are required" });  
    }  
    if (!mongoose.Types.ObjectId.isValid(roleId)) {  
        return res.status(400).json({ success: false, message: "Invalid roleId" });  
    }  

    // Check email in all collections  
    const emailInSuperAdmin = await Admin.findOne({ email });  
    const emailInRoleAdmin = await AdminRoleAdmin.findOne({ email });  
    const emailInTeamMember = await TeamMember.findOne({ email });  

    if (emailInSuperAdmin || emailInRoleAdmin || emailInTeamMember) {  
        return res.status(400).json({ success: false, message: "Email already in use" });  
    }  

    const role = await AdminRole.findById(roleId);  
    if (!role) return res.status(404).json({ success: false, message: "Role not found" });  
    if (role.archived) return res.status(400).json({ success: false, message: "Role is archived" });  

    // enforce maxUsers  
    if (role.maxUsers > 0) {  
        const count = await AdminRoleAdmin.countDocuments({ role: role._id });  
        if (count >= role.maxUsers) {  
            return res.status(400).json({ success: false, message: `Role user limit reached (${role.maxUsers})` });  
        }  
    }  

    const createdBy = req.admin?._id || req.roleAdmin?._id || null;  
    const admin = await AdminRoleAdmin.create({  
        name,  
        email,  
        password,  
        role: roleId,  
        createdBy  
    });  

    res.status(201).json({  
        success: true,  
        message: "AdminRoleAdmin registered successfully",  
        admin: {  
            id: admin._id,  
            name: admin.name,  
            email: admin.email,  
            role: role.roleName  
        }  
    });  

} catch (err) {  
    console.error('registerRoleAdmin error:', err);  
    res.status(500).json({ success: false, error: err.message });  
}  


};
// Login as AdminRoleAdmin
export const loginRoleAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await AdminRoleAdmin.findOne({ email }).populate('role');

        if (!admin) return res.status(404).json({ message: 'Role Admin not found' });

        // locked?
        if (admin.lockUntil && admin.lockUntil > new Date()) {
            const msLeft = admin.lockUntil - new Date();
            const seconds = Math.floor((msLeft / 1000) % 60);
            const minutes = Math.floor((msLeft / (1000 * 60)) % 60);
            const hours = Math.floor((msLeft / (1000 * 60 * 60)) % 24);
            return res.status(403).json({
                message: `Account locked. Try again in ${hours}h ${minutes}m ${seconds}s.`
            });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            admin.loginAttempts = (admin.loginAttempts || 0) + 1;
            if (admin.loginAttempts >= 3) {
                admin.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
                admin.loginAttempts = 0;
                await admin.save();
                await notifyMainAdmins('AdminRoleAdmin Locked', { message: `Admin ${admin.email} locked` }).catch(() => { });
                return res.status(403).json({ message: 'Account locked due to multiple failed login attempts. Try again in 24 hours.' });
            }
            await admin.save();
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // success
        admin.loginAttempts = 0;
        admin.lockUntil = undefined;
        await admin.save();

        // create token (include type + role)
        const token = generateToken({ id: admin._id, type: 'AdminRoleAdmin', role: admin.role?._id });

        res.status(200).json({
            message: 'Role admin logged in successfully',
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                permissions: admin.role?.permissions || []
            },
        });
    } catch (err) {
        console.error('loginRoleAdmin error:', err);
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// Get role admin profile
export const getRoleAdminProfile = async (req, res) => {
    try {
        const id = req.roleAdmin?._id || req.user?.id;
        if (!id) return res.status(401).json({ message: 'Unauthorized' });

        const admin = await AdminRoleAdmin.findById(id).select('-password').populate('role');
        if (!admin) return res.status(404).json({ message: 'Not found' });

        res.status(200).json({ success: true, admin });
    } catch (err) {
        console.error('getRoleAdminProfile error:', err);
        res.status(500).json({ message: 'Error fetching profile', error: err.message });
    }
};

export const getAccountGeneralSettings = async (req, res) => {
    try {
        const id = req.roleAdmin?._id || req.user?.id;
        const admin = await AdminRoleAdmin.findById(id).select('-password');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
        res.status(200).json({ success: true, admin });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateAccountGeneralSettings = async (req, res) => {
    try {
        const id = req.roleAdmin?._id || req.user?.id;
        const { name, newsletter, optimizeSpeed } = req.body;
        const updated = await AdminRoleAdmin.findByIdAndUpdate(
            id,
            {
                ...(name && { name }),
                ...(newsletter !== undefined && { newsletter }),
                ...(optimizeSpeed !== undefined && { optimizeSpeed })
            },
            { new: true }
        ).select('-password');
        res.status(200).json({ success: true, admin: updated });
    } catch (err) {
        console.error('updateAccountGeneralSettings error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ Upload/Change Profile Picture
export const uploadProfilePic = async (req, res) => {
    try {
        const id = req.roleAdmin?._id || req.user?.id;
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        // Replace with your real uploader in prod (S3/Cloudinary)
        const profilePicPath = `/uploads/profilePics/${req.file.filename}`;

        const updated = await AdminRoleAdmin.findByIdAndUpdate(
            id,
            { profilePic: profilePicPath },
            { new: true }
        ).select('-password');

        res.status(200).json({ success: true, profilePic: profilePicPath, admin: updated });
    } catch (err) {
        console.error('uploadProfilePic error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ Delete Admin Account
export const deleteRoleAdminAccount = async (req, res) => {
    try {
        const toDeleteId = req.params.id || req.roleAdmin?._id;
        if (!toDeleteId) return res.status(400).json({ message: 'Missing id' });

        const actor = req.admin || req.roleAdmin; // super admin or roleadmin
        if (!actor) return res.status(401).json({ message: 'Unauthorized' });

        const target = await AdminRoleAdmin.findById(toDeleteId);
        if (!target) return res.status(404).json({ message: 'Admin not found' });

        // only super admin, creator, or self can delete
        if (!req.isSuperAdmin && !(String(target.createdBy) === String(actor._id)) && String(actor._id) !== String(target._id)) {
            return res.status(403).json({ message: 'Not authorized to delete this admin' });
        }

        await target.deleteOne();
        res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } catch (err) {
        console.error('deleteRoleAdminAccount error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
