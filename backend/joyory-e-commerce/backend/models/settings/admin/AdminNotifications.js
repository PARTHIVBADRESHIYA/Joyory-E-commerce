import mongoose from 'mongoose';

const notificationSettingSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'adminType'
    },
    adminType: {
        type: String,
        required: true,
        enum: ['Admin', 'AdminRoleAdmin']
    },
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
