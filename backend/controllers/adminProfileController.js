import Admin from '../models/Admin.js';
import cloudinary from '../middlewares/utils/cloudinary.js';   // same cloudinary util
import bcrypt from 'bcryptjs';

// ======================= GET ADMIN PROFILE =======================
export const getAdminProfile = async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin._id)
            .select('name email role profileImage');

        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        res.status(200).json({
            profile: {
                fullName: admin.name,
                email: admin.email,
                role: admin.role || null,
                profileImage: admin.profileImage || null
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to get admin profile', error: err.message });
    }
};

// ======================= UPDATE ADMIN PROFILE =======================
export const updateAdminProfile = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        const admin = await Admin.findById(req.admin._id);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        if (fullName) admin.name = fullName;

        // if email changed
        if (email && email !== admin.email) {
            admin.email = email;
        }

        // if password changed
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            admin.password = hashedPassword;
        }

        await admin.save();
        return res.status(200).json({ message: 'Admin profile updated successfully' });
    } catch (err) {
        return res.status(500).json({ message: 'Failed to update admin profile', error: err.message });
    }
};

// ======================= UPLOAD / UPDATE PROFILE IMAGE =======================
export const uploadAdminProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const uploadResult = await cloudinary.uploader.upload(req.file.path);

        const admin = await Admin.findById(req.admin._id);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        // delete old image from cloudinary if exists
        if (admin.profileImageId) {
            await cloudinary.uploader.destroy(admin.profileImageId);
        }

        admin.profileImage = uploadResult.secure_url;
        admin.profileImageId = uploadResult.public_id;
        await admin.save();

        res.status(200).json({
            message: 'Admin profile image updated',
            profileImage: uploadResult.secure_url
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to upload admin profile image', error: err.message });
    }
};

// ======================= REMOVE PROFILE IMAGE =======================
export const removeAdminProfileImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin._id);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        if (!admin.profileImage) {
            return res.status(400).json({ message: 'No profile image to remove' });
        }

        if (admin.profileImageId) {
            await cloudinary.uploader.destroy(admin.profileImageId);
        }

        admin.profileImage = null;
        admin.profileImageId = null;
        await admin.save();

        res.status(200).json({ message: 'Admin profile image removed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to remove admin profile image', error: err.message });
    }
};

// ======================= GET CURRENT PROFILE IMAGE =======================
export const getAdminProfileImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin._id).select('profileImage');
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        if (!admin.profileImage) {
            return res.status(404).json({ message: 'No profile image found' });
        }

        res.status(200).json({ profileImage: admin.profileImage });
    } catch (err) {
        res.status(500).json({ message: 'Failed to get admin profile image', error: err.message });
    }
};
