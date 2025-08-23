import mongoose from 'mongoose';

// models/settings/admin/AdminRole.js
const AdminRoleSchema = new mongoose.Schema({
    roleName: { type: String, required: true , unique: true },
    description: { type: String },
    users: { type: Number, required: true, min: 1 },
    permissions: {
        dashboard: { view: Boolean, customize: Boolean },
        orders: { view: Boolean, edit: Boolean, delete: Boolean },
        products: { view: Boolean, manage: Boolean },
        settings: { update: Boolean, manageRoles: Boolean }
    },
    teamMembers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });


export default mongoose.model('AdminRole', AdminRoleSchema);
