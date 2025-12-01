import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const TeamMemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // assigned role
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRole', required: true },

    // NEW: Unique permissions assigned to this team member
    permissionSubset: [{ type: String }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRoleAdmin' },

    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    otp: {
        code: String,
        expiresAt: Date
    },
    otpRequests: [{ type: Date }],
}, { timestamps: true });

TeamMemberSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

export default mongoose.model('TeamMember', TeamMemberSchema);
