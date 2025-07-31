import mongoose from 'mongoose';

const storeSettingsSchema = new mongoose.Schema({
    logo: { type: String },
    storeName: { type: String, required: true },
    storeUrl: { type: String },
    email: { type: String },
    phone: { type: String },
    description: { type: String },

    address: {
        street: String,
        city: String,
        state: String,
        zip: String,
    },

    timeZone: { type: String },
    maintenanceMode: { type: Boolean, default: false },
}, {
    timestamps: true
});

export default mongoose.model('StoreSettings', storeSettingsSchema);
