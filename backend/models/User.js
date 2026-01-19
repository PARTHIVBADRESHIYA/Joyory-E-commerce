import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String },
    phone: String,
    addresses: [{
        name: String,
        email: String,
        phone: String,
        pincode: String,
        city: String,
        state: String,
        country: String,
        addressLine1: String,
        addressLine2: String
    }]
    ,
    gender: { type: String, enum: ['male', 'female', 'other'], default: null },
    dob: { type: Date, default: null },
    marketingPrefs: {
        celebrateBirthdayMonth: { type: Boolean, default: true } // birthday month vs exact day
    },

    role: {
        type: String,
        enum: ['user', 'admin', 'seller'],
        default: 'user'
    },
    profileImage: { type: String, default: null },

    profileImageId: { type: String, default: null }
    ,
    cart: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true

            },
            quantity: {
                type: Number,
                default: 1,
            },
            selectedVariant: {
                sku: String,
                shadeName: String,
                hex: String,
                images: [String],   // ✅ FIX
            }
        }
    ],
    abandonedCart: {
        isActive: { type: Boolean, default: false },

        lastUpdatedAt: { type: Date },   // updated on add/remove cart
        checkoutStartedAt: { type: Date }, // ✅ FIX

        emailStages: {
            stage1SentAt: Date, // 1 hr
            stage2SentAt: Date, // 24 hr
            stage3SentAt: Date  // 72 hr
        }
    },

    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    otp: {
        code: { type: String },
        expiresAt: { type: Date }
    },
    otpRequests: [{ type: Date }]
    ,
    isVerified: {
        type: Boolean,
        default: false,
    },
    pendingPhone: { type: String, default: null }
    ,
    phoneVerified: { type: Boolean, default: false }
    ,
    preferredOtpMethod: {
        type: String,
        enum: ['email', 'sms'],
        default: 'email'
    },
    conversionStats: {
        viewCount: { type: Number, default: 0 },        // ✅ ADD THIS
        addToCartCount: { type: Number, default: 0 },
        checkoutCount: { type: Number, default: 0 },
        orderCount: { type: Number, default: 0 }
    },
    recentlyViewed: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        viewedAt: { type: Date, default: Date.now }
    }],
    recentCategoryViews: [{
        category: mongoose.Schema.Types.Mixed,
        viewedAt: Date
    }]
    ,
    savedRecommendations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    lastRecommendationUpdate: { type: Date },
    // wishlist: [
    //     {
    //         productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    //         name: { type: String }
    //     }
    // ],
    wishlist: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },
            sku: {
                type: String,
                required: true
            },
            name: String,
            shadeName: String,
            hex: String,
            image: String,
            addedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    // 🆕 track selected shade/variant
    selectedVariant: {
        sku: String,
        shadeName: String,
        hex: String,
        image: String
    },

    referralCode: { type: String, unique: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    referredByCampaign: { type: mongoose.Schema.Types.ObjectId, ref: "ReferralCampaign" },

    rewardPoints: { type: Number, default: 0 }, // points user has
    joyoryCash: { type: Number, default: 0 }, // cash added to wallet

    // ADD inside schema
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Wallet",
        default: null
    }
    ,
    createdBy: {
        type: String,
        enum: ['admin', 'self'],
        default: 'self' // signup default
    }
}, { timestamps: true });

userSchema.pre("save", function (next) {
    if (Array.isArray(this.recentlyViewed)) {
        this.recentlyViewed = this.recentlyViewed.filter(
            v => v && v.product
        );
    }
    next();
});

// ADD after schema
userSchema.virtual("walletDetails", {
    ref: "Wallet",
    localField: "_id",
    foreignField: "user",
    justOne: true
});

userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);

