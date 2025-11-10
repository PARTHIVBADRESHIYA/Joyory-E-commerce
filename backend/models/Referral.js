import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    referee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'rewarded', 'cancelled'], default: 'pending' },
    rewardForReferrer: { type: Number, default: 0 },
    rewardForReferee: { type: Number, default: 0 },
    minOrderAmount: { type: Number, default: 0 }, // min order for reward to trigger
    rewardedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('Referral', referralSchema);
