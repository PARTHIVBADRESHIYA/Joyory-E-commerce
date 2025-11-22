// // models/Order.js
// import mongoose from 'mongoose';

// // const RefundSchema = new mongoose.Schema({
// //     order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
// //     payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
// //     amount: { type: Number, required: true }, // rupees
// //     method: { type: String, enum: ["razorpay", "wallet", "manual_upi"], required: true },
// //     status: { type: String, enum: ["initiated", "processing", "completed", "failed"], default: "initiated" },
// //     gatewayRefundId: { type: String, default: null },
// //     upiId: { type: String, default: null },
// //     initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who requested
// //     processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }, // who processed
// //     reason: { type: String },
// //     notes: { type: String },
// //     attempts: { type: Number, default: 0 }
// // }, { timestamps: true });

// // const CancellationSchema = new mongoose.Schema({
// //     cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
// //     reason: { type: String, default: null },
// //     requestedAt: { type: Date },
// //     allowed: { type: Boolean, default: true }, // used if admin blocks cancellation
// //     processedAt: { type: Date },
// //     processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null }
// // }, { _id: false });

// const RefundSchema = new mongoose.Schema({
//     amount: Number,
//     method: { type: String, enum: ["razorpay", "wallet", "manual_upi"] },
//     status: {
//         type: String,
//         enum: ["requested", "approved", "initiated", "processing", "completed", "failed"],
//         default: "requested"
//     },
//     reason: String,
//     requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//     approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
//     gatewayRefundId: String,
//     attempts: { type: Number, default: 0 },
//     refundedAt: Date
// }, { timestamps: true });

// const CancellationSchema = new mongoose.Schema({
//     cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//     reason: String,
//     requestedAt: Date,
//     allowed: { type: Boolean, default: true }
// }, { _id: false });

// const orderSchema = new mongoose.Schema({
//     // models/Order.js
//     products: [
//         {
//             productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//             quantity: { type: Number, required: true },
//             price: { type: Number, required: true },
//             seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },

//             // ✅ New field for selected variant
//             variant: {
//                 sku: String,
//                 shadeName: String,
//                 hex: String,
//                 image: String,
//                 stock: Number,
//                 originalPrice: Number,
//                 discountedPrice: Number,
//                 displayPrice: Number,
//                 discountPercent: Number,
//                 discountAmount: Number,
//             }
//         }
//     ],

//     // 🔹 Gift card purchase (optional if order is for a gift card)
//     giftCard: {
//         templateId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCardTemplate" },
//         recipient: {
//             name: String,
//             email: String,
//             phone: String
//         },
//         senderMessage: String,
//         amount: Number
//     },

//     orderId: { type: String, required: true, unique: true },
//     orderNumber: { type: Number, required: true, unique: true },
//     customOrderId: { type: String, index: true, sparse: true },
//     user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // 👈 Add this
//     date: { type: Date, required: true },
//     customerName: { type: String, required: true },
//     status: { type: String, enum: ['Pending', 'Delivered', 'Cancelled', 'Completed'], default: 'Pending' },
//     orderType: {
//         type: String, enum: ['COD', 'Online', 'Credit card'], default: null // ✅ we set it later
//     },
//     discount: { type: String, default: null },
//     discountCode: String,
//     discountAmount: Number,
//     affiliate: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate' },
//     buyerDiscountAmount: { type: Number, default: 0 },
//     shippingAddress: {
//         type: Object, // or use a sub-schema if structured
//         required: false
//     },
//     razorpayOrderId: { type: String },
//     paid: { type: Boolean, default: false },
//     paymentStatus: {
//         type: String, enum: [
//             "pending",
//             "success",
//             "failed",
//             "cancelled",
//             "refund_requested",
//             "refund_initiated",
//             "refunded",
//             "refund_failed"
//         ], default: 'pending'
//     },
//     paymentMethod: { type: String },
//     transactionId: { type: String },
//     // NEW
//     refund: { type: RefundSchema, default: () => ({}) },
//     cancellation: { type: CancellationSchema, default: () => ({}) },
//     orderStatus: {
//         type: String,
//         enum: [
//             "Pending",
//             "Awaiting Payment",
//             "Paid",
//             "Processing",
//             "Awaiting Pickup",   // ✅ added for Shiprocket
//             "Shipped",
//             "Out for Delivery",  // ✅ optional: common Shiprocket status
//             "Delivered",
//             "Cancelled",
//             "Returned"           // ✅ optional: if you plan to support returns
//         ],
//         default: "Pending",
//     },
//     ecard: {
//         occasion: { type: String, enum: ['WELCOME', 'BIRTHDAY', 'FESTIVAL', 'TEST'] },
//         message: { type: String },
//         emailSentAt: { type: Date },
//         pdfUrl: { type: String },          // uploaded print asset (optional)
//         includePhysical: { type: Boolean, default: false }, // for packing team
//     },
//     splitOrders: [
//         {
//             seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
//             items: [
//                 {
//                     productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
//                     qty: Number,
//                     price: Number,
//                     name: String
//                 }
//             ],
//             amount: { type: Number, default: 0 },
//             status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
//             trackingNumber: String,
//             courierName: String
//         }
//     ],

//     trackingHistory: [
//         {
//             status: { type: String },
//             timestamp: { type: Date, default: Date.now },
//             location: { type: String }
//         }
//     ],
//     invoice: {
//         number: String,
//         pdfUrl: String,
//         generatedAt: Date,
//     }
//     ,
//     amount: { type: Number, required: true },
//     promotionUsed: {
//         promotionId: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion" },
//         campaignName: String,
//     },
//     shipment: {
//         shiprocket_order_id: { type: String },  // Shiprocket's internal order ID
//         shipment_id: { type: String },          // Shiprocket shipment ID
//         awb_code: { type: String },             // Unique Air Way Bill number
//         courier_company_id: { type: String },   // Courier ID from Shiprocket
//         courier_name: { type: String },         // Human-readable courier name
//         tracking_url: { type: String },         // Shiprocket tracking URL
//         status: { type: String, default: "Created" }, // Created, Shipped, Delivered etc.
//         assignedAt: { type: Date },             // When AWB assigned
//         deliveredAt: { type: Date },            // When order marked delivered
//     }




// }, { timestamps: true });

// // in Order schema (if you can edit schema)
// orderSchema.index({ 'splitOrders.seller': 1 });
// orderSchema.index({ "refund.status": 1 });
// orderSchema.index({ "cancellation.requestedAt": 1 });


// export default mongoose.model('Order', orderSchema);


import mongoose from 'mongoose';

const RefundSchema = new mongoose.Schema({
    amount: Number,
    method: { type: String, enum: ["razorpay", "wallet", "manual_upi"] },
    status: {
        type: String,
        enum: ["requested", "approved", "rejected", "initiated", "processing", "completed", "failed"],
        default: "requested"
    },
    reason: String,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    gatewayRefundId: String,
    refundAudit: [
        {
            status: String,
            changedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "refundAudit.changedByModel" },
            changedByModel: { type: String, enum: ["User", "Admin"] },
            timestamp: { type: Date, default: Date.now },
            note: String
        }
    ]
    ,
    attempts: { type: Number, default: 0 },
    refundedAt: Date
}, { timestamps: true });

const CancellationSchema = new mongoose.Schema({
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
    requestedAt: Date,
    allowed: { type: Boolean, default: true }
}, { _id: false });

const ShipmentSchema = new mongoose.Schema({
    warehouseCode: String,              // NEW
    pickup_location: String,            // NEW
    pickup_address_id: String,          // NEW
    shiprocket_order_id: String,        // NEW

    shipment_id: String,
    awb_code: String,
    courier_company_id: String,
    courier_name: String,
    tracking_url: String,
    status: { type: String, default: "Created" },
    assignedAt: Date,
    deliveredAt: Date,
    expected_delivery: Date,

    products: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            quantity: Number,
            price: Number,
            variant: Object
        }
    ],

    trackingHistory: [
        {
            status: String,
            timestamp: { type: Date, default: Date.now },
            location: String,
            description: String
        }
    ]
});

const orderSchema = new mongoose.Schema({

    products: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
            quantity: Number,
            price: Number,
            seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },
            variant: {
                sku: String,
                shadeName: String,
                hex: String,
                image: String,
                stock: Number,
                originalPrice: Number,
                discountedPrice: Number,
                displayPrice: Number,
                discountPercent: Number,
                discountAmount: Number
            }
        }
    ],

    subtotal: { type: Number, default: 0 },
    totalSavings: { type: Number, default: 0 },

    couponDiscount: { type: Number, default: 0 },
    pointsDiscount: { type: Number, default: 0 },
    giftCardDiscount: { type: Number, default: 0 },

    pointsUsed: { type: Number, default: 0 },

    giftCardApplied: {
        code: { type: String },
        amount: { type: Number, default: 0 },
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCardTemplate" }
    },

    giftCard: {
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCardTemplate" },
        recipient: { name: String, email: String, phone: String },
        senderMessage: String,
        amount: Number
    },

    orderId: String,
    orderNumber: Number,
    customOrderId: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: Date,
    customerName: String,

    // status: { type: String, enum: ['Pending', 'Delivered', 'Cancelled', 'Completed'], default: 'Pending' },

    orderType: { type: String, enum: ['COD', 'Online', 'Credit card'], default: null },
    isDraft: { type: Boolean, default: true },
    adminConfirmed: { type: Boolean, default: false },

    discount: String,
    discountCode: String,
    affiliate: { type: mongoose.Schema.Types.ObjectId, ref: "Affiliate" },

    shippingAddress: { type: Object },

    razorpayOrderId: String,
    paid: { type: Boolean, default: false },

    paymentStatus: {
        type: String,
        enum: [
            "pending",
            "success",
            "failed",
            "cancelled",
            "refund_requested",
            "refund_initiated",
            "refunded",
            "refund_failed"
        ],
        default: 'pending'
    },

    paymentMethod: String,
    transactionId: String,

    refund: { type: RefundSchema, default: () => ({}) },
    cancellation: { type: CancellationSchema, default: () => ({}) },

    orderStatus: {
        type: String,
        enum: [
            "Pending",
            "Awaiting Admin Confirmation",
            "Awaiting Payment",
            "Paid",
            "Processing",
            "Awaiting Pickup",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
            "Returned"
        ],
        default: "Pending"
    },

    splitOrders: [
        {
            seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },
            items: [
                {
                    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
                    qty: Number,
                    price: Number,
                    name: String
                }
            ],
            amount: Number,
            status: { type: String, enum: ["pending", "processing", "shipped", "delivered", "cancelled"], default: "pending" },
            trackingNumber: String,
            courierName: String
        }
    ],

    trackingHistory: [
        {
            status: String,
            timestamp: { type: Date, default: Date.now },
            location: String
        }
    ],

    invoice: {
        number: String,
        pdfUrl: String,
        generatedAt: Date
    },

    amount: Number,

    promotionUsed: {
        promotionId: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion" },
        campaignName: String
    },
    // Replace the single shipment field with:
    shipments: [ShipmentSchema],
    primary_shipment: { type: mongoose.Schema.Types.ObjectId } // reference to main shipment

}, { timestamps: true });

orderSchema.index({ "refund.status": 1 });
orderSchema.index({ "cancellation.requestedAt": 1 });

export default mongoose.model("Order", orderSchema);
