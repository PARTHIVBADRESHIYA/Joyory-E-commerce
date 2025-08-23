// models/Inventory.js
import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  buyingPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  thresholdValue: { type: Number, required: true },
  expiryDate: { type: Date, required: true },
  availability: {
    type: String,
    enum: ['In-stock', 'Out of stock'],
    default: 'In-stock'
  }
}, { timestamps: true });

export default mongoose.model('Inventory', inventorySchema);
