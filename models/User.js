import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // optional if created by admin
    phone: String,
    address1: String,
    address2: String,
    state: String,
    country: String,
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    createdBy: {
        type: String,
        enum: ['admin', 'self'],
        default: 'self' // signup default
    }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};
export default mongoose.model('User', userSchema);
