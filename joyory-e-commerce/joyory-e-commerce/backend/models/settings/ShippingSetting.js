// models/settings/ShippingSettings.js
import mongoose from 'mongoose';

const shippingSettingsSchema = new mongoose.Schema({
  methodName: { type: String, required: true },
  description: { type: String },
  shippingZones: { type: String, required: true }, // e.g., "United States"
  estimatedDelivery: { type: String },
  rate: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  shippingCostRules: { type: String }, // Optional field or use array if needed
}, { timestamps: true });

export default mongoose.model('ShippingSettings', shippingSettingsSchema);
