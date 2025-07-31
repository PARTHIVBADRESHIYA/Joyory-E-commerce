import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import AdminRoleAdmin from '../../../models/settings/admin/AdminRoleAdmin.js';
import AdminRole from '../../../models/settings/admin/AdminRole.js';

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

        const existing = await AdminRoleAdmin.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, message: "Email already registered" });
        }

        const role = await AdminRole.findById(roleId);
        if (!role) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = await AdminRoleAdmin.create({
            name,
            email,
            password: hashedPassword,
            role: roleId
        });

        // Add this first admin to teamMembers (optional, or do only for TeamMember model)
        role.teamMembers.push(admin._id);
        await role.save();

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
        res.status(500).json({ success: false, error: err.message });
    }
};


// Login as AdminRoleAdmin
export const loginRoleAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await AdminRoleAdmin.findOne({ email }).populate('role');
        if (!admin) return res.status(404).json({ message: 'Role Admin not found' });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: admin._id, role: admin.role._id }, JWT_SECRET, {
            expiresIn: '1d',
        });

        res.status(200).json({
            message: 'Role admin logged in successfully',
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
            },
        });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// Get role admin profile
export const getRoleAdminProfile = async (req, res) => {
    try {
        const admin = await AdminRoleAdmin.findById(req.roleAdminId).populate('role');
        if (!admin) return res.status(404).json({ message: 'Not found' });

        res.status(200).json({ success: true, admin });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching profile', error: err.message });
    }
};

// ✅ Get General Account Settings
export const getAccountGeneralSettings = async (req, res) => {
    try {
        const admin = await AdminRoleAdmin.findById(req.roleAdminId).select('-password');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

        res.status(200).json({ success: true, admin });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ Update General Account Settings
export const updateAccountGeneralSettings = async (req, res) => {
    try {
        const { name, newsletter, optimizeSpeed } = req.body;

        const updated = await AdminRoleAdmin.findByIdAndUpdate(
            req.roleAdminId,
            {
                ...(name && { name }),
                ...(newsletter !== undefined && { newsletter }),
                ...(optimizeSpeed !== undefined && { optimizeSpeed })
            },
            { new: true }
        ).select('-password');

        res.status(200).json({ success: true, admin: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ Upload/Change Profile Picture
export const uploadProfilePic = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const profilePicPath = `/uploads/profilePics/${req.file.filename}`;

        const updated = await AdminRoleAdmin.findByIdAndUpdate(
            req.roleAdminId,
            { profilePic: profilePicPath },
            { new: true }
        ).select('-password');

        res.status(200).json({ success: true, profilePic: profilePicPath, admin: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ Delete Admin Account
export const deleteRoleAdminAccount = async (req, res) => {
    try {
        const admin = await AdminRoleAdmin.findById(req.roleAdminId);
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

        await admin.deleteOne();
        res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
