// models/Campaign.js
import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
    campaignName: String,
    campaignType: String,         // e.g., Email, Push
    objective: String,            // e.g., Sale, Awareness
    description: String,

    subjectLine: String,
    headerImage: String,
    emailBody: String,
    ctaText: String,
    redirectUrl: String,

    audience: String,             // e.g., All Customers
    filters: {
        age: String,
        location: String
    },

    schedule: {
        sendNow: Boolean,
        date: Date,
        timeZone: String
    },
    // Add to Campaign Schema
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    delivered: { type: Boolean, default: false },
    deliveredAt: Date,

    trackOpens: { type: Boolean, default: true },
    trackClicks: { type: Boolean, default: true },
    utmParameters: String,
    tags: [String],

    status: { type: String, default: 'Scheduled' }, // Completed, Scheduled, Draft
    opens: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    newCustomers: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },

    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Campaign', campaignSchema);
