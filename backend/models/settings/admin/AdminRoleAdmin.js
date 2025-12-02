import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const RoleAdminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // This MUST be required
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRole', required: true },

    // PROFILE FIELDS
    gender: { type: String, enum: ["male", "female", "other"], default: null },
    department: { type: String, default: null },
    workLocation: { type: String, default: null },
    joiningDate: { type: Date, default: null },
    roleTitle: { type: String, default: "Admin" },
    roleIdText: { type: String, default: null },

    profileImage: { type: String, default: null },
    profileImageId: { type: String, default: null },

    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, // who created this admin

    otp: {
        code: String,
        expiresAt: Date
    },
    otpRequests: [{ type: Date }],
}, { timestamps: true });

RoleAdminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

export default mongoose.model('AdminRoleAdmin', RoleAdminSchema);
