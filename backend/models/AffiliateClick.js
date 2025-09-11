import mongoose from 'mongoose';


const affiliateClickSchema = new mongoose.Schema({
    affiliate: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate', required: true },
    affiliateLinkShortCode: { type: String },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    ip: String,
    userAgent: String,
    referer: String,
    createdAt: { type: Date, default: Date.now }
});


// helps with analytics queries
affiliateClickSchema.index({ affiliate: 1, createdAt: -1 });


export default mongoose.model('AffiliateClick', affiliateClickSchema);