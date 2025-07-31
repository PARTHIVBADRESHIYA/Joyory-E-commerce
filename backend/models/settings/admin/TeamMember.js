import mongoose from 'mongoose';

const TeamMemberSchema = new mongoose.Schema({
    name: String,
    email: { type: String, required: true, unique: true },
    password: String, // hashed
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRole' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' } // the admin or sub-admin who invited
}, { timestamps: true });

export default mongoose.model('TeamMember', TeamMemberSchema);
