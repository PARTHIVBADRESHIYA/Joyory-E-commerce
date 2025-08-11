// models/Order.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    products: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            quantity: { type: Number, required: true },
            price: { type: Number, required: true }
        }
    ],
    orderId: { type: String, required: true, unique: true },
    orderNumber: { type: Number, required: true, unique: true },
    customOrderId: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // 👈 Add this
    date: { type: Date, required: true },
    customerName: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Delivered', 'Cancelled', 'Completed'], default: 'Pending' },
    orderType: { type: String, enum: ['COD', 'Online', 'Credit card'], required: true },
    discount: { type: mongoose.Schema.Types.ObjectId, ref: 'Discount', default: null },
    discountCode: String,
    discountAmount: Number,
    affiliate: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate' },
    buyerDiscountAmount: { type: Number, default: 0 },
    shippingAddress: {
        type: Object, // or use a sub-schema if structured
        required: false
    },

    amount: { type: Number, required: true },
    promotionUsed: {
        promotionId: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion" },
        campaignName: String,
    },
    // models/Order.js (add fields like this)
    refund: {
        isRefunded: { type: Boolean, default: false },
        refundAmount: { type: Number, default: 0 },
        refundReason: { type: String },
        refundedAt: { type: Date },
    },


}, { timestamps: true });



export default mongoose.model('Order', orderSchema);
