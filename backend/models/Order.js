// import mongoose from 'mongoose';

// const ShipmentReturnSchema = new mongoose.Schema({

//     type: {
//         type: String,
//         enum: ["return", "replace"],
//         required: true
//     },

//     // Shiprocket IDs
//     shiprocket_order_id: { type: String },  // Changed from shiprocketOrderId
//     shipment_id: { type: String },          // Changed from return_shipment_id

//     // AWB & tracking
//     awb_code: { type: String },
//     courier_name: { type: String },
//     tracking_url: { type: String },

//     // Status - FIXED: Removed "approved" from enum
//     status: {
//         type: String,
//         enum: [
//             "requested",
//             "pickup_scheduled",
//             "picked_up",
//             "in_transit",
//             "delivered_to_warehouse",
//             "qc_passed",
//             "qc_failed",
//             "cancelled"
//         ],
//         default: "requested"
//     },

//     // Pickup details (customer)
//     pickup_details: {  // Changed from pickupDetails
//         name: String,
//         address: String,
//         city: String,
//         state: String,
//         pincode: String,
//         phone: String,
//         email: String
//     },

//     // Warehouse details
//     warehouse_details: {
//         name: String,
//         address: String,
//         city: String,
//         state: String,
//         pincode: String,
//         phone: String,
//         email: String
//     },

//     // Returned items
//     items: [
//         {
//             productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
//             quantity: Number,
//             variant: Object,
//             reason: String,
//             reasonDescription: String,
//             images: [String],
//             condition: String,
//         }
//     ],

//     // Tracking timeline
//     tracking_history: [{  // Changed from tracking_history
//         status: String,
//         timestamp: Date,
//         location: String,
//         description: String
//     }],

//     // QC results
//     qc: {
//         checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
//         checkedAt: Date,
//         notes: String,
//         images: [String],
//         status: { type: String, enum: ["pending", "passed", "failed"] }
//     },

//     // Refund
//     refund: {
//         amount: Number,
//         status: {
//             type: String,
//             enum: ["pending", "initiated", "processing", "completed", "failed"],
//             default: "pending"
//         },
//         gatewayRefundId: String,
//         refundedAt: Date
//     },

//     // Audit trail
//     audit_trail: [{  // Changed from auditTrail
//         status: String,
//         action: String,
//         timestamp: { type: Date, default: Date.now },
//         performedBy: { type: mongoose.Schema.Types.ObjectId },
//         performedByModel: { type: String, enum: ["User", "Admin", "System"] },
//         notes: String,
//         metadata: Object
//     }],

//     createdAt: { type: Date, default: Date.now },
//     requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//     requestedAt: Date,
//     reason: { type: String, enum: ["DAMAGED", "WRONG_ITEM", "EXPIRED", "QUALITY_ISSUE", "SIZE_ISSUE", "NO_LONGER_NEEDED", "OTHER"], required: true },
//     description: String
// }, { timestamps: true });

// const ShipmentSchema = new mongoose.Schema({
//     type: { type: String, enum: ["forward"], default: "forward" },

//     // Shiprocket IDs
//     shiprocket_order_id: String,
//     shipment_id: String,

//     // AWB & tracking
//     awb_code: String,
//     courier_name: String,
//     tracking_url: String,

//     // Status
//     status: {
//         type: String,
//         default: "Created",
//         enum: [
//             "Created",
//             "AWB Assigned",
//             "Pickup Scheduled",
//             "Pickup Done",
//             "In Transit",
//             "Out for Delivery",
//             "Delivered",
//             "Cancelled",
//             "RTO Initiated",
//             "RTO Delivered"
//         ]
//     },

//     sync_failed: { type: Boolean, default: false },
//     sync_failed_at: Date,

//     // Timestamps
//     assignedAt: Date,
//     shippedAt: Date,
//     deliveredAt: Date,
//     expected_delivery: Date,

//     // Items
//     products: [
//         {
//             productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
//             quantity: Number,
//             price: Number,
//             variant: Object
//         }
//     ],

//     // Tracking history - FIXED: Changed to tracking_history for consistency
//     tracking_history: [{
//         status: String,
//         timestamp: Date,
//         location: String,
//         description: String
//     }],

//     // Returns - FIXED: Use the updated schema
//     returns: [ShipmentReturnSchema]

// });

// const CancellationSchema = new mongoose.Schema({
//     cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//     reason: String,
//     requestedAt: Date,
//     allowed: { type: Boolean, default: true }
// }, { _id: false });


// const orderSchema = new mongoose.Schema({

//     products: [
//         {
//             productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
//             quantity: Number,
//             price: Number,
//             seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },
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
//                 discountAmount: Number
//             }
//         }
//     ],

//     subtotal: { type: Number, default: 0 },
//     totalSavings: { type: Number, default: 0 },
//     shippingCharge: { type: Number, default: 0 },
//     couponDiscount: { type: Number, default: 0 },
//     pointsDiscount: { type: Number, default: 0 },
//     giftCardDiscount: { type: Number, default: 0 },

//     pointsUsed: { type: Number, default: 0 },

//     giftCardApplied: {
//         code: { type: String },
//         amount: { type: Number, default: 0 },
//         templateId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCardTemplate" }
//     },

//     giftCard: {
//         templateId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCardTemplate" },
//         recipient: { name: String, email: String, phone: String },
//         senderMessage: String,
//         amount: Number
//     },
//     gst: {
//         rate: { type: Number, default: 12 },        // %
//         amount: { type: Number, default: 0 },       // ₹
//         taxableAmount: { type: Number, default: 0 } // before GST
//     },

//     orderId: String,
//     orderNumber: Number,
//     customOrderId: String,
//     user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//     date: Date,
//     customerName: String,

//     // status: { type: String, enum: ['Pending', 'Delivered', 'Cancelled', 'Completed'], default: 'Pending' },

//     orderType: { type: String, enum: ['COD', 'Online', 'Credit card'], default: null },
//     isDraft: { type: Boolean, default: true },
//     adminConfirmed: { type: Boolean, default: false },

//     discount: String,
//     discountCode: String,
//     affiliate: {
//         slug: { type: String, default: null },
//         applied: { type: Boolean, default: false },
//         affiliateUser: { type: mongoose.Schema.Types.ObjectId, ref: "AffiliateUser", default: null },
//         affiliateLink: { type: String, default: null }
//     },

//     shippingAddress: { type: Object },

//     razorpayOrderId: String,
//     paid: { type: Boolean, default: false },

//     paymentStatus: {
//         type: String,
//         enum: [
//             "pending",
//             "success",
//             "failed",
//             "cancelled"
//         ],
//         default: 'pending'
//     },

//     paymentMethod: String,
//     transactionId: String,

//     cancellation: { type: CancellationSchema, default: () => ({}) },

//     orderStatus: {
//         type: String,
//         enum: [
//             "Pending",
//             "Awaiting Admin Confirmation",
//             "Awaiting Payment",
//             "Paid",
//             "Processing",
//             "Awaiting Pickup",
//             "Shipped",
//             "Out for Delivery",
//             "Delivered",
//             "Cancelled",
//             "Returned",
//             // NEW FOR YOUR FLOW
//             "Partially Delivered",
//             "Partially Cancelled",
//             "Partially Delivered / Cancelled"
//         ],
//         default: "Pending"
//     },

//     splitOrders: [
//         {
//             seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },
//             items: [
//                 {
//                     productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
//                     qty: Number,
//                     price: Number,
//                     name: String
//                 }
//             ],
//             amount: Number,
//             status: { type: String, enum: ["pending", "processing", "shipped", "delivered", "cancelled"], default: "pending" },
//             trackingNumber: String,
//             courierName: String
//         }
//     ],

//     returnRequest: {
//         type: {
//             type: String, enum: ["return", "replace"],
//         },
//         reason: String,
//         description: String,
//         images: [String],  // URLs of uploaded images
//         requestedAt: Date,
//         status: {
//             type: String,
//             enum: ["pending", "approved", "rejected", "completed"],
//             default: "pending"
//         },
//         adminNote: String,
//         approvedAt: Date,
//         completedAt: Date,
//     },

//     invoice: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Invoice",
//         default: null
//     },

//     amount: Number,

//     promotionUsed: {
//         promotionId: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion" },
//         campaignName: String
//     },
//     // Replace the single shipment field with:
//     shipments: [ShipmentSchema],
//     primary_shipment: { type: mongoose.Schema.Types.ObjectId },// reference to main shipment,


//     returnPolicy: {
//         applicable: { type: Boolean, default: true },
//         days: { type: Number, default: 7 },
//         eligibleUntil: Date,
//         conditions: [String], // e.g., ["Unopened", "Original Packaging", "Invoice Required"]
//     },
//     // Track return eligibility
//     isReturnable: { type: Boolean, default: true },
//     returnWindowEnd: Date,

//     // Analytics
//     returnStats: {
//         totalReturns: { type: Number, default: 0 },
//         totalRefunds: { type: Number, default: 0 },
//         totalReplacements: { type: Number, default: 0 },
//         avgProcessingTime: Number, // in hours
//     },

// }, { timestamps: true });

// orderSchema.index({ "cancellation.requestedAt": 1 });
// orderSchema.index({ "shipments.returns.awb_code": 1 });
// orderSchema.index({ "shipments.returns.refund.gatewayRefundId": 1 });
// orderSchema.index({ "shipments.returns.status": 1 });

// export default mongoose.model("Order", orderSchema);



//the above part is complete for first phase and for shiprocekt related things



import mongoose from 'mongoose';

const ShipmentReturnSchema = new mongoose.Schema({

    type: {
        type: String,
        enum: ["return", "replace"],
        required: true
    },

    // ✅ DELHIVERY ONLY
    provider: {
        type: String,
        enum: ["delhivery"],
        default: "delhivery",
        required: true
    },

    delhivery_reverse_pickup_id: String,
    waybill: String,

    courier_name: { type: String, default: "Delhivery" },
    tracking_url: String,

    status: {
        type: String,
        enum: [
            "requested",
            "pickup_scheduled",
            "picked_up",
            "in_transit",
            "delivered_to_warehouse",
            "qc_passed",
            "qc_failed",
            "cancelled"
        ],
        default: "requested"
    },

    pickup_details: {
        name: String,
        address: String,
        city: String,
        state: String,
        pincode: String,
        phone: String,
        email: String
    },

    warehouse_details: {
        name: String,
        address: String,
        city: String,
        state: String,
        pincode: String,
        phone: String,
        email: String
    },

    items: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            quantity: Number,
            variant: Object,
            reason: String,
            reasonDescription: String,
            images: [String],
            condition: String
        }
    ],

    tracking_history: [
        {
            status: String,
            timestamp: Date,
            location: String,
            description: String
        }
    ],

    qc: {
        checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        checkedAt: Date,
        notes: String,
        images: [String],
        status: { type: String, enum: ["pending", "passed", "failed"] }
    },

    refund: {
        amount: Number,
        status: {
            type: String,
            enum: ["pending", "initiated", "processing", "completed", "failed"],
            default: "pending"
        },
        gatewayRefundId: String,
        refundedAt: Date
    }

}, { timestamps: true });


const ShipmentSchema = new mongoose.Schema({

    type: { type: String, enum: ["forward"], default: "forward" },

    // ✅ DELHIVERY ONLY
    provider: {
        type: String,
        enum: ["delhivery"],
        default: "delhivery",
        required: true
    },

    delhivery_pickup_id: String,   // returned during create shipment
    waybill: String,               // AWB number

    // Tracking
    courier_name: { type: String, default: "Delhivery" },
    tracking_url: String,

    status: {
        type: String,
        enum: [
            "Created",
            "Pending",
            "Pickup Scheduled",
            "Picked Up",
            "In Transit",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
            "RTO Initiated",
            "RTO Delivered"
        ],
        default: "Created"
    },

    assignedAt: Date,
    shippedAt: Date,
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

    tracking_history: [
        {
            status: String,
            timestamp: Date,
            location: String,
            description: String
        }
    ],

    returns: [ShipmentReturnSchema] // will attach ShipmentReturnSchema
});


const CancellationSchema = new mongoose.Schema({
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
    requestedAt: Date,
    allowed: { type: Boolean, default: true }
}, { _id: false });


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
    shippingCharge: { type: Number, default: 0 },
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
    gst: {
        rate: { type: Number, default: 12 },        // %
        amount: { type: Number, default: 0 },       // ₹
        taxableAmount: { type: Number, default: 0 } // before GST
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
    affiliate: {
        slug: { type: String, default: null },
        applied: { type: Boolean, default: false },
        affiliateUser: { type: mongoose.Schema.Types.ObjectId, ref: "AffiliateUser", default: null },
        affiliateLink: { type: String, default: null }
    },

    shippingAddress: { type: Object },

    razorpayOrderId: String,
    paid: { type: Boolean, default: false },

    paymentStatus: {
        type: String,
        enum: [
            "pending",
            "success",
            "failed",
            "cancelled"
        ],
        default: 'pending'
    },

    paymentMethod: String,
    transactionId: String,

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
            "Returned",
            // NEW FOR YOUR FLOW
            "Partially Delivered",
            "Partially Cancelled",
            "Partially Delivered / Cancelled"
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

    returnRequest: {
        type: {
            type: String, enum: ["return", "replace"],
        },
        reason: String,
        description: String,
        images: [String],  // URLs of uploaded images
        requestedAt: Date,
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "completed"],
            default: "pending"
        },
        adminNote: String,
        approvedAt: Date,
        completedAt: Date,
    },

    invoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Invoice",
        default: null
    },

    amount: Number,

    promotionUsed: {
        promotionId: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion" },
        campaignName: String
    },
    // Replace the single shipment field with:
    shipments: [ShipmentSchema],
    primary_shipment: { type: mongoose.Schema.Types.ObjectId },// reference to main shipment,


    returnPolicy: {
        applicable: { type: Boolean, default: true },
        days: { type: Number, default: 7 },
        eligibleUntil: Date,
        conditions: [String], // e.g., ["Unopened", "Original Packaging", "Invoice Required"]
    },
    // Track return eligibility
    isReturnable: { type: Boolean, default: true },
    returnWindowEnd: Date,

    // Analytics
    returnStats: {
        totalReturns: { type: Number, default: 0 },
        totalRefunds: { type: Number, default: 0 },
        totalReplacements: { type: Number, default: 0 },
        avgProcessingTime: Number, // in hours
    },

}, { timestamps: true });

orderSchema.index({ "cancellation.requestedAt": 1 });
orderSchema.index({ "shipments.returns.waybill": 1 });

orderSchema.index({ "shipments.returns.refund.gatewayRefundId": 1 });
orderSchema.index({ "shipments.returns.status": 1 });

export default mongoose.model("Order", orderSchema);
