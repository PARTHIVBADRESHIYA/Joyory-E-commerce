import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String },
    phone: String,
    addresses: [{
        fullName: String,
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

    role: {
        type: String,
        enum: ['user', 'admin'],
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
            }
        }
    ],
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
    recentCategories: [{ type: mongoose.Schema.Types.Mixed }], // 👈 can store either ObjectId or String
    recentProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    savedRecommendations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    lastRecommendationUpdate: { type: Date },
    wishlist: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product"
        }
    ],


    createdBy: {
        type: String,
        enum: ['admin', 'self'],
        default: 'self' // signup default
    }
}, { timestamps: true });

// userSchema.pre('save', async function (next) {
//     if (!this.isModified('password')) return next();
//     this.password = await bcrypt.hash(this.password, 10);
//     next();
// });
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
