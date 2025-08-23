// models/PendingAdmin.js
import mongoose from "mongoose";

const pendingAdminSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String, // hashed password
    otp: {
        code: String,
        expiresAt: Date,
        attemptsLeft: { type: Number, default: 3 }
    },
    createdAt: { type: Date, default: Date.now, expires: 600 } // auto-delete after 10 mins
});

export default mongoose.model("PendingAdmin", pendingAdminSchema);
