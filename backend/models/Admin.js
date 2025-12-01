import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isSuperAdmin: { type: Boolean, default: false },
    profileImage: { type: String },
    profileImageId: { type: String },

    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    otp: {
        code: { type: String },
        expiresAt: { type: Date }
    },
    otpRequests: [{ type: Date }]

}, { timestamps: true });

adminSchema.pre('save', async function (next) {
    // If password is already bcrypt hashed (starts with $2b$), skip hashing
    if (this.password && this.password.startsWith("$2b$")) {
        return next();
    }

    // Otherwise hash normally
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }

    next();
});

// Method to compare passwords
adminSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('Admin', adminSchema);
