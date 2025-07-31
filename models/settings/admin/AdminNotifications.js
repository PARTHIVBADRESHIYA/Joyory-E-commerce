import mongoose from 'mongoose';

const notificationSettingSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRoleAdmin', required: true, unique: true },
    email: {
        productUpdates: { type: Boolean, default: false },
        securityUpdates: { type: Boolean, default: false },
        customerChat: { type: Boolean, default: false }
    },
    phone: {
        securityUpdates: { type: Boolean, default: false },
        customerChat: { type: Boolean, default: false }
    }
});

export default mongoose.model('NotificationSetting', notificationSettingSchema);
