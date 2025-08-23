import mongoose from 'mongoose';

const promotionSchema = new mongoose.Schema({
    internalName: { type: String, required: true },
    description: { type: String },
    campaignName: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive', 'upcoming', 'expired'], default: 'inactive' },
    promotionType: { type: String, enum: ['discount', 'bundle', 'buy1get1'], required: true },
    targetAudience: { type: String, enum: ['all', 'new', 'existing'], default: 'all' },
    channels: [{ type: String, enum: ['email', 'sms', 'in-app', 'push'] }],
    eligibility: { type: String },
    methods: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    startTime: { type: String },
    endTime: { type: String },
    banners: [{ type: String }], // File URLs or paths
    promoCodes: [{ type: String }],
    conversions: { type: Number, default: 0 },
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    }
}, { timestamps: true });

export default mongoose.model('Promotion', promotionSchema);
