import mongoose from 'mongoose';
import { ALL_PERMISSIONS } from '../../../permissions.js';
const AdminRoleSchema = new mongoose.Schema({
    roleName: { type: String, required: true, unique: true },
    description: String,

    maxUsers: { type: Number, default: 0 }, // 0 = unlimited

    // list of allowed permissions → modern RBAC
    permissions: [
        { type: String, enum: ALL_PERMISSIONS, required: true } // ✅ only valid permissions
    ],
    archived: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, // super admin only
}, { timestamps: true });

export default mongoose.model('AdminRole', AdminRoleSchema);
