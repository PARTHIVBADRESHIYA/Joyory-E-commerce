import mongoose from 'mongoose';

const loginHistorySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRoleAdmin', required: true },
    loginType: String,
    ipAddress: String,
    browser: String,
    time: { type: Date, default: Date.now }
});

export default mongoose.model('LoginHistory', loginHistorySchema);
