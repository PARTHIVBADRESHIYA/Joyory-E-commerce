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
    }
}, { timestamps: true });

export default mongoose.model('AdminRoleAdmin', AdminRoleAdminSchema);