import Admin from "../models/Admin.js";
import AdminRoleAdmin from "../models/settings/admin/AdminRoleAdmin.js";
import TeamMember from "../models/settings/admin/TeamMember.js";
import bcrypt from "bcryptjs";
import cloudinary from "../middlewares/utils/cloudinary.js";
import { uploadToCloudinary } from "../middlewares/upload.js";

export const getModel = (type) => {
    if (!type) return null;

    const key = type.toLowerCase();

    const models = {
        "superadmin": Admin,
        "super_admin": Admin,
        "super admin": Admin,

        "adminroleadmin": AdminRoleAdmin,
        "admin_role_admin": AdminRoleAdmin,
        "admin": AdminRoleAdmin,

        "teammember": TeamMember,
        "team_member": TeamMember,
        "team member": TeamMember,
    };

    return models[key] || null;
};


// ---------------------------------------------------
// GET ADMIN PROFILE
// ---------------------------------------------------
export const getAdminProfile = async (req, res) => {
    try {
        const UserModel = getModel(req.user?.type);
        if (!UserModel) {
            return res.status(400).json({ message: "Invalid user type" });
        }

        // Base Query
        let query = UserModel.findById(req.user.id).select(
            "name email gender department workLocation joiningDate  profileImage role "
        );

        // Only populate if model uses a role
        if (UserModel.schema.path("role")) {
            query = query.populate("role", "name _id permissions");
        }

        const user = await query;
        if (!user) return res.status(404).json({ message: "Profile not found" });

        const formattedDate = user.joiningDate
            ? new Date(user.joiningDate).toLocaleDateString("en-GB")
            : null;

        // USER TYPE LABEL
        const userType =
            req.user.type === "superadmin"
                ? "Super Admin"
                : req.user.type === "adminroleadmin"
                ? "Admin Role Admin"
                : "Team Member";

        // ROLE DETAILS
        let roleName = null;
        let roleId = null;

        if (user.role) {
            roleName = user.role.name;
            roleId = user.role._id;
        } else if (req.user.type === "superadmin") {
            roleName = "Super Admin";
        }

        return res.status(200).json({
            profile: {
                name: user.name,
                email: user.email,

                gender: user.gender,
                department: user.department,
                workLocation: user.workLocation,
                joiningDate: formattedDate,

                roleTitle:userType,
                roleId,
                profileImage: user.profileImage
            }
        });
    } catch (err) {
        res.status(500).json({
            message: "Failed to load profile",
            error: err.message
        });
    }
};

// ---------------------------------------------------
// UPDATE ADMIN PROFILE
// ---------------------------------------------------
export const updateAdminProfile = async (req, res) => {
    try {
        const UserModel = getModel(req.user.type);
        const user = await UserModel.findById(req.user.id);

        if (!user) return res.status(404).json({ message: "Profile not found" });

        const {
            name,
            email,
            gender,
            department,
            workLocation,
            joiningDate,
            roleTitle,
            roleIdText
        } = req.body;

        if (name) user.name = name;
        if (gender) user.gender = gender;
        if (department) user.department = department;
        if (workLocation) user.workLocation = workLocation;
        if (joiningDate) user.joiningDate = new Date(joiningDate);
        if (roleTitle) user.roleTitle = roleTitle;
        if (roleIdText) user.roleIdText = roleIdText;

        if (email && email !== user.email) {
            user.email = email;
        }

        await user.save();

        return res.status(200).json({
            message: "Profile updated successfully"
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to update profile", error: err.message });
    }
};


// ---------------------------------------------------
// UPDATE PROFILE IMAGE (Cloudinary)
// ---------------------------------------------------
export const updateAdminProfileImage = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: "No image uploaded" });
        }

        const UserModel = getModel(req.user.type);
        const user = await UserModel.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // delete previous
        if (user.profileImageId) {
            await cloudinary.uploader.destroy(user.profileImageId);
        }

        // upload new
        const result = await uploadToCloudinary(req.file.buffer, "admin/profile");

        const imageUrl = typeof result === "string" ? result : result.secure_url;
        const publicId = typeof result === "string" ? "" : result.public_id;

        user.profileImage = imageUrl;
        user.profileImageId = publicId;
        await user.save();

        return res.status(200).json({
            message: "Profile image updated",
            profileImage: imageUrl,
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to upload image", error: err.message });
    }
};

// ---------------------------------------------------
// REMOVE PROFILE IMAGE
// ---------------------------------------------------
export const removeAdminProfileImage = async (req, res) => {
    try {
        const UserModel = getModel(req.user.type);
        const user = await UserModel.findById(req.user.id);

        if (!user) return res.status(404).json({ message: "User not found" });

        if (!user.profileImage) {
            return res.status(400).json({ message: "No profile image to remove" });
        }

        if (user.profileImageId) await cloudinary.uploader.destroy(user.profileImageId);

        user.profileImage = null;
        user.profileImageId = null;
        await user.save();

        return res.status(200).json({ message: "Profile image removed" });
    } catch (err) {
        res.status(500).json({ message: "Failed to remove image", error: err.message });
    }
};


