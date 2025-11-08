// import mongoose from 'mongoose';

// // models/settings/admin/AdminRole.js
// const AdminRoleSchema = new mongoose.Schema({
//     roleName: { type: String, required: true , unique: true },
//     description: { type: String },
//     users: { type: Number, required: true, min: 1 },
//     permissions: {
//         dashboard: { view: Boolean, customize: Boolean },
//         orders: { view: Boolean, edit: Boolean, delete: Boolean },
//         products: { view: Boolean, manage: Boolean },
//         settings: { update: Boolean, manageRoles: Boolean }
//     },
//     teamMembers: [{
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Admin'
//     }],
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
// }, { timestamps: true });


// export default mongoose.model('AdminRole', AdminRoleSchema);





// models/settings/admin/AdminRole.js
import mongoose from 'mongoose';

const AdminRoleSchema = new mongoose.Schema({
    roleName: { type: String, required: true, unique: true },
    description: { type: String },
    users: { type: Number, required: true, min: 1 },

    // your existing nested object (keep as-is for backward compatibility)
    permissions: {
        dashboard: { view: Boolean, customize: Boolean },
        orders: { view: Boolean, edit: Boolean, delete: Boolean },
        products: { view: Boolean, manage: Boolean },
        settings: { update: Boolean, manageRoles: Boolean }
    },

    // NEW fields (non-breaking additions)
    permissionsList: [{ type: String }], // e.g. ['products:view','orders:refund']
    maxUsers: { type: Number, default: 0 }, // 0 => unlimited (keeps compatibility with `users`)
    archived: { type: Boolean, default: false }, // soft-delete flag

    teamMembers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

export default mongoose.model('AdminRole', AdminRoleSchema);
