import mongoose from 'mongoose';

const AdminRoleAdminSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRole' },
    newsletter: {
        type: Boolean,
        default: false
    },
    optimizeSpeed: {
        type: Boolean,
        default: true
    },
    profilePic: {
        type: String, // URL or path
        default: ''
    },
    otp: {
    code: { type: String },
    expiresAt: { type: Date }
},
otpRequests: [{ type: Date }]
,

      // 🔒 Security fields
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date }

}, { timestamps: true });

export default mongoose.model('AdminRoleAdmin', AdminRoleAdminSchema);