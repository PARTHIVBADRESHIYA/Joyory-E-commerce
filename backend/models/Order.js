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
    customOrderId: { type: String, index: true, sparse: true },
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
    razorpayOrderId: { type: String },
    paid: { type: Boolean, default: false },
    paymentStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    paymentMethod: { type: String },
    transactionId: { type: String },
    orderStatus: {
        type: String,
        enum: ["Pending", "Awaiting Payment", "Paid", "Processing", "Shipped", "Delivered", "Cancelled"]
        ,
        default: "Pending"
    }
    ,
    trackingHistory: [
        {
            status: { type: String },
            timestamp: { type: Date, default: Date.now },
            location: { type: String }
        }
    ],

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
    shipment: {
        shiprocket_order_id: { type: String },  // Shiprocket's internal order ID
        shipment_id: { type: String },          // Shiprocket shipment ID
        awb_code: { type: String },             // Unique Air Way Bill number
        courier_company_id: { type: String },   // Courier ID from Shiprocket
        courier_name: { type: String },         // Human-readable courier name
        tracking_url: { type: String },         // Shiprocket tracking URL
        status: { type: String, default: "Created" }, // Created, Shipped, Delivered etc.
        assignedAt: { type: Date },             // When AWB assigned
        deliveredAt: { type: Date },            // When order marked delivered
    }




}, { timestamps: true });



export default mongoose.model('Order', orderSchema);
