// // models/PendingAdmin.js
// import mongoose from "mongoose";

// const pendingAdminSchema = new mongoose.Schema({
//     name: String,
//     email: { type: String, unique: true },
//     password: String, // hashed password,
//     isSuperAdmin: { type: Boolean, default: false },
//     otp: {
//         code: String,
//         expiresAt: Date,
//         attemptsLeft: { type: Number, default: 3 }
//     },
//     createdAt: { type: Date, default: Date.now, expires: 600 } // auto-delete after 10 mins
// });

// export default mongoose.model("PendingAdmin", pendingAdminSchema);



// PendingUser.js
import mongoose from "mongoose";

const pendingUserSchema = new mongoose.Schema({
    userType: { type: String, enum: ["SUPER_ADMIN", "ROLE_ADMIN", "TEAM_MEMBER"], required: true },
    name: String,
    email: String,
    password: String, // hashed
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminRole", default: null },
    permissionSubset: [String],

    // OTP
    otp: {
        code: String,
        expiresAt: Date,
        attemptsLeft: { type: Number, default: 3 }
    }
}, { timestamps: true });

export default mongoose.model("PendingUser", pendingUserSchema);
