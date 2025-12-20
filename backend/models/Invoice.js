// models/Invoice.js
import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, unique: true, required: true },

    invoicePdfUrl: { type: String, required: true },  // cloudinary url

    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customerName: String,

    shippingAddress: {
        name: String,
        phone: String,
        addressLine1: String,
        addressLine2: String,
        city: String,
        state: String,
        pincode: String,
        country: { type: String, default: "India" }
    },

    items: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            name: String,
            sku: String,
            quantity: Number,
            price: Number,
            total: Number,
            hsn: String
        }
    ],

    subtotal: Number,
    taxPercent: Number,
    taxAmount: Number,

    shippingCharge: Number,
    discountAmount: Number,

    grandTotal: Number,

    paymentMethod: String,
    paid: { type: Boolean, default: false },

    generatedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

export default mongoose.model("Invoice", invoiceSchema);
