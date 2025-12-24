import User from '../../models/User.js';
import Order from '../../models/Order.js';
import { generateUniqueReferralCode } from '../../middlewares/utils/referral.js';
import Referral from '../../models/Referral.js';
import ReferralCampaign from '../../models/ReferralCampaign.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { generateOTP } from '../../middlewares/utils/generateOTP.js';
import { sendEmail, sendVerificationEmail } from '../../middlewares/utils/emailService.js';
import { sendSms } from '../../middlewares/utils/sendSms.js';
import { mergeGuestCart } from '../../controllers/user/userCartController.js';
// import { notifyMainAdmins } from '../middlewares/utils/notifyMainAdmins.js'; // ✅ Make sure this path is correct
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";

// JWT Token Generator
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// =================== USER SIGNUP ===================
// const userSignup = async (req, res) => {
//     try {
//         const { name, email, password, phone, preferredOtpMethod, referralCode } = req.body;

//         if (!name || !email || !password) {
//             return res.status(400).json({ message: "name, email and password are required" });
//         }

//         const existing = await User.findOne({ email });
//         if (existing) return res.status(400).json({ message: "Email already registered" });

//         const method = (preferredOtpMethod && ["email", "sms"].includes(preferredOtpMethod.toLowerCase()))
//             ? preferredOtpMethod.toLowerCase()
//             : "email";
//         const actualMethod = method === "sms" && phone ? "sms" : "email";

//         // Generate OTP & hash password
//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         const myReferralCode = await generateUniqueReferralCode();

//         // Create user object
//         const user = new User({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: "user",
//             isManual: true,
//             isVerified: false,
//             preferredOtpMethod: actualMethod,
//             otp: { code: hashedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
//             referralCode: myReferralCode,
//         });

//         // Handle referral
//         let referrer = null;
//         if (referralCode) {
//             referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
//             if (!referrer) return res.status(400).json({ message: "Invalid referral code" });
//             if (referrer.email === email) return res.status(400).json({ message: "Cannot use own referral code" });
//             user.referredBy = referrer._id;
//         }

//         await user.save();

//         if (referrer) {
//             await Referral.create({
//                 referrer: referrer._id,
//                 referee: user._id,
//                 status: "pending",
//                 rewardForReferrer: 200,
//                 rewardForReferee: 200,
//                 minOrderAmount: 100,
//             });
//         }

//         // 🔥 Merge guest cart from session
//         const guestCart = req.session?.guestCart || [];
//         if (guestCart.length) {
//             await mergeGuestCart(user._id, guestCart);
//             req.session.guestCart = []; // clear after merging
//         }

//         // Send OTP
//         try {
//             if (actualMethod === "sms") {
//                 await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
//             } else {
//                 await sendEmail(
//                     email,
//                     "Verify your account",
//                     `<p>Your verification OTP is: <b>${plainOtp}</b></p>`
//                 );
//             }
//         } catch (err) {
//             console.error("❌ OTP sending failed:", err);
//             return res.status(500).json({
//                 message: "Signup succeeded but sending OTP failed. Please request OTP again.",
//                 error: err.message,
//             });
//         }

//         return res.status(201).json({
//             message: "Signup successful. OTP sent.",
//             otpSent: true,
//             method: actualMethod,
//             email: user.email,
//             referralCode: user.referralCode,
//             referralLink: `${process.env.APP_URL || "https://yourdomain.com"}/signup?ref=${user.referralCode}`,
//             mergedCart: guestCart.length > 0
//         });

//     } catch (err) {
//         console.error("🔥 Signup error:", err);
//         res.status(500).json({ message: "Signup failed", error: err.message });
//     }
// };


const userSignup = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            preferredOtpMethod,
            referralCode,
            promo
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "name, email and password are required" });
        }

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: "Email already registered" });

        const method = (preferredOtpMethod && ["email", "sms"].includes(preferredOtpMethod.toLowerCase()))
            ? preferredOtpMethod.toLowerCase()
            : "email";

        const actualMethod = method === "sms" && phone ? "sms" : "email";

        const plainOtp = generateOTP();
        const hashedOtp = await bcrypt.hash(plainOtp, 10);
        const hashedPassword = await bcrypt.hash(password, 10);

        const myReferralCode = await generateUniqueReferralCode();

        // ✅ Detect referral campaign
        let campaign = null;
        if (promo) {
            campaign = await ReferralCampaign.findOne({
                promoCode: promo.toUpperCase(),
                isActive: true,
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            });

            if (!campaign) {
                return res.status(400).json({ message: "Invalid or expired referral link" });
            }
        }

        // ✅ Create user object
        const user = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: "user",
            isManual: true,
            isVerified: false,
            preferredOtpMethod: actualMethod,
            otp: { code: hashedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
            referralCode: myReferralCode,
        });

        // ✅ Attach campaign ID
        if (campaign) {
            user.referredByCampaign = campaign._id;
        }

        // ✅ Normal referral code logic
        let referrer = null;
        if (referralCode) {
            referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
            if (!referrer) return res.status(400).json({ message: "Invalid referral code" });
            if (referrer.email === email) return res.status(400).json({ message: "Cannot use own referral code" });

            user.referredBy = referrer._id;
        }

        await user.save();

        // ✅ Instant wallet reward for campaign (only user gets reward)
        if (campaign) {
            const wallet = await getOrCreateWallet(user._id);

            wallet.rewardPoints += campaign.refereeReward;
            wallet.transactions.push({
                type: "REWARD",
                amount: campaign.refereeReward,
                mode: "POINTS",
                description: `Signup reward from campaign ${campaign.name}`
            });

            await wallet.save();
        }

        // ✅ Existing referral code system (unchanged)
        if (referrer) {
            await Referral.create({
                referrer: referrer._id,
                referee: user._id,
                status: "pending",
                rewardForReferrer: 200,
                rewardForReferee: 200,
                minOrderAmount: 100,
            });
        }

        // ✅ Merge guest cart
        const guestCart = req.session?.guestCart || [];
        if (guestCart.length) {
            await mergeGuestCart(user._id, guestCart);
            req.session.guestCart = [];
        }

        // ✅ Send OTP
        try {
            if (actualMethod === "sms") {
                await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
            } else {
                await sendVerificationEmail(
                    { name, email },   // pass user object
                    plainOtp           // pass OTP only
                );

            }
        } catch (err) {
            console.error("❌ OTP sending failed:", err);
            return res.status(500).json({
                message: "Signup succeeded but sending OTP failed. Please request OTP again.",
                error: err.message,
            });
        }

        return res.status(201).json({
            message: "Signup successful. OTP sent.",
            otpSent: true,
            method: actualMethod,
            email: user.email,
            referralCode: user.referralCode,
            referralLink: `${process.env.APP_URL || "https://yourdomain.com"}/signup?ref=${user.referralCode}`,
            mergedCart: guestCart.length > 0,
            campaignApplied: campaign
                ? {
                    name: campaign.name,
                    rewardForUser: campaign.refereeReward,
                    minOrderAmount: campaign.minOrderAmount
                }
                : null
        });

    } catch (err) {
        console.error("🔥 Signup error:", err);
        res.status(500).json({ message: "Signup failed", error: err.message });
    }
};

// =================== USER LOGIN ===================
// const userLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         if (!email || !password) {
//             return res.status(400).json({
//                 message: "Please enter both your email and password to log in."
//             });
//         }

//         const user = await User.findOne({ email });
//         if (!user || user.role !== "user") {
//             return res.status(401).json({ message: "No account found with this email. Please check your email or sign up." });
//         }

//         if (!user.isVerified) {
//             return res.status(403).json({ message: "Your email is not verified yet. Please verify your email before logging in." });
//         }

//         if (user.lockUntil && user.lockUntil > new Date()) {
//             const remaining = user.lockUntil - new Date();
//             const m = Math.floor((remaining % 3600000) / 60000);
//             const s = Math.floor((remaining % 60000) / 1000);
//             return res.status(403).json({
//                 message: `Your account is temporarily locked due to multiple failed login attempts. Try again in ${m}m ${s}s.`
//             });
//         }

//         const isMatch = await user.matchPassword(password);
//         if (!isMatch) {
//             user.loginAttempts = (user.loginAttempts || 0) + 1;
//             if (user.loginAttempts >= 5) {
//                 user.lockUntil = new Date(Date.now() + 5 * 60 * 1000);
//                 user.loginAttempts = 0;
//                 await user.save();
//                 return res.status(403).json({ message: "Too many failed attempts. Account locked for 5 minutes." });
//             }
//             await user.save();
//             return res.status(401).json({
//                 message: `Incorrect password. You have ${5 - user.loginAttempts} attempts left.`
//             });
//         }

//         // Success
//         user.loginAttempts = 0;
//         user.lockUntil = undefined;
//         await user.save();

//         // 🔥 Merge guest cart from session
//         const guestCart = req.session?.guestCart || [];
//         if (guestCart.length) {
//             await mergeGuestCart(user._id, guestCart);
//             req.session.guestCart = []; // clear after merging
//         }

//         const token = generateToken(user);
//         res.cookie("token", token, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
//             maxAge: 7 * 24 * 60 * 60 * 1000
//         });

//         return res.status(200).json({
//             message: `Welcome back, ${user.name}!`,
//             user: { id: user._id, name: user.name, role: user.role },
//             mergedCart: guestCart.length > 0
//         });

//     } catch (err) {
//         console.error("❌ Login error:", err);
//         return res.status(500).json({
//             message: "Something went wrong while logging in. Please try again later."
//         });
//     }
// };
const userLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Please enter both your email and password to log in."
            });
        }

        const user = await User.findOne({ email });
        if (!user || user.role !== "user") {
            return res.status(401).json({ message: "No account found with this email. Please check your email or sign up." });
        }

        if (!user.isVerified) {
            return res.status(403).json({ message: "Your email is not verified yet. Please verify your email before logging in." });
        }

        if (user.lockUntil && user.lockUntil > new Date()) {
            const remaining = user.lockUntil - new Date();
            const m = Math.floor((remaining % 3600000) / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            return res.status(403).json({
                message: `Your account is temporarily locked due to multiple failed login attempts. Try again in ${m}m ${s}s.`
            });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.lockUntil = new Date(Date.now() + 5 * 60 * 1000);
                user.loginAttempts = 0;
                await user.save();
                return res.status(403).json({ message: "Too many failed attempts. Account locked for 5 minutes." });
            }
            await user.save();
            return res.status(401).json({
                message: `Incorrect password. You have ${5 - user.loginAttempts} attempts left.`
            });
        }

        // Success
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();

        // 🔥 Merge guest cart from session
        const guestCart = req.session?.guestCart || [];
        if (guestCart.length) {
            await mergeGuestCart(user._id, guestCart);
            req.session.guestCart = []; // clear after merging
        }

        const token = generateToken(user);


        const isProd = process.env.NODE_ENV === "production";

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            // domain: ".joyory.com", // ⚠️ Comment out or delete this line for initial testing
            maxAge: 7 * 24 * 60 * 60 * 1000,
            partitioned: true // 🔥 Critical for Chrome's new policy [citation:1]
        });


        return res.status(200).json({
            message: `Welcome back, ${user.name}!`,
            user: { id: user._id, name: user.name, role: user.role },
            mergedCart: guestCart.length > 0
        });

    } catch (err) {
        console.error("❌ Login error:", err);
        return res.status(500).json({
            message: "Something went wrong while logging in. Please try again later."
        });
    }
};
export default userLogin;

// @desc    User Login (5 attempts → 5min lock)
// const userLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;


//         const user = await User.findOne({ email });
//         if (!user || user.role !== 'user') return res.status(401).json({ message: 'Invalid credentials' });

//         if (!user.isVerified) {
//             return res.status(403).json({ message: 'Please verify your email before logging in.' });
//         }


//         // Check lock
//         if (user.lockUntil && user.lockUntil > new Date()) {
//             const remaining = user.lockUntil - new Date();
//             const m = Math.floor((remaining % 3600000) / 60000);
//             const s = Math.floor((remaining % 60000) / 1000);
//             return res.status(403).json({ message: `Account locked. Try again in ${m}m ${s}s.` });
//         }

//         const isMatch = await user.matchPassword(password);
//         if (!isMatch) {
//             user.loginAttempts = (user.loginAttempts || 0) + 1;

//             if (user.loginAttempts >= 5) {
//                 user.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
//                 user.loginAttempts = 0;
//             }

//             await user.save();
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         // Success
//         user.loginAttempts = 0;
//         user.lockUntil = undefined;
//         await user.save();

//         const token = generateToken(user);
//         res.status(200).json({ token, user: { id: user._id, name: user.name, role: user.role } });
//     } catch (err) {
//         res.status(500).json({ message: 'Login failed', error: err.message });
//     }
// };

// Track Product View (with authenticated user)
const trackProductView = async (req, res) => {
    try {
        const { productId, category } = req.body;
        const userId = req.user._id;

        if (!productId || !category) {
            return res.status(400).json({ message: "Product ID and category are required" });
        }

        // Push to beginning, remove duplicates, trim to last 20 items
        await User.findByIdAndUpdate(
            userId,
            {
                $pull: { recentProducts: productId, recentCategories: category }
            }
        );

        await User.findByIdAndUpdate(
            userId,
            {
                $push: {
                    recentProducts: { $each: [productId], $position: 0, $slice: 20 },
                    recentCategories: { $each: [category], $position: 0, $slice: 20 }
                }
            },
            { new: true }
        );

        res.json({ message: "User activity updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating user activity" });
    }
};

// controllers/authController.js
// const logoutUser = (req, res) => {
//     res.clearCookie('token'); // removes the JWT cookie
//     return res.status(200).json({ message: 'Logged out successfully' });
// };
const logoutUser = (req, res) => {
    try {
        // 1️⃣ Clear the token cookie
        res.cookie("token", "", {
            httpOnly: true, // prevent JS access
            secure: process.env.NODE_ENV === "production", // HTTPS only in production
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            path: "/", // match login path
            expires: new Date(0) // immediately expire
        });

        // 2️⃣ Prevent caching of sensitive pages
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1
        res.setHeader("Pragma", "no-cache"); // HTTP 1.0
        res.setHeader("Expires", "0"); // Proxies

        // 3️⃣ Return success message
        return res.status(200).json({
            message: "You have been logged out successfully."
        });
    } catch (err) {
        console.error("❌ Logout error:", err);
        return res.status(500).json({
            message: "Something went wrong during logout. Please try again later."
        });
    }
};

// @desc Delete account permanently
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id;

        // 1) Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2) Delete related records
        await Order.deleteMany({ user: userId });       // delete all user orders
        await Referral.deleteMany({ $or: [{ referrer: userId }, { referee: userId }] }); // remove referrals

        // 3) Delete user
        await User.findByIdAndDelete(userId);

        // 4) Clear token cookie
        res.clearCookie("token");

        return res.status(200).json({ message: "✅ Your account and all related data have been deleted permanently." });
    } catch (error) {
        console.error("❌ Account deletion error:", error);
        return res.status(500).json({ message: "Failed to delete account", error: error.message });
    }
};



export {
    userSignup,
    userLogin,
    trackProductView,
    logoutUser,
    deleteAccount
};














// 📌 User Signup
// const userSignup = async (req, res) => {
//     try {
//         const { name, email, password, phone, preferredOtpMethod } = req.body;
//         if (!name || !email || !password) {
//             return res.status(400).json({ message: 'name, email and password are required' });
//         }

//         const existing = await User.findOne({ email });
//         if (existing) return res.status(400).json({ message: 'Email already registered' });

//         const method = (preferredOtpMethod && ['email', 'sms'].includes(preferredOtpMethod.toLowerCase()))
//             ? preferredOtpMethod.toLowerCase()
//             : 'email';
//         const willUseSms = method === 'sms' && phone;
//         const actualMethod = willUseSms ? 'sms' : 'email';

//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         const user = await User.create({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: 'user',
//             isManual: true,
//             isVerified: false,
//             preferredOtpMethod: actualMethod,
//             otp: { code: hashedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
//         });

//         try {
//             if (actualMethod === 'sms') {
//                 await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
//             } else {
//                 await sendEmail(email, 'Verify your account', `<p>Your verification OTP is: <b>${plainOtp}</b></p>`);
//             }
//         } catch (err) {
//             console.error('OTP send failed:', err);
//             return res.status(500).json({
//                 message: 'Signup succeeded but sending OTP failed. Please request OTP again.',
//                 error: err.message
//             });
//         }

//         return res.status(201).json({
//             message: 'Signup successful. OTP sent.',
//             method: actualMethod,
//             email: user.email
//         });
//     } catch (err) {
//         console.error('Signup error:', err);
//         res.status(500).json({ message: 'Signup failed', error: err.message });
//     }
// };


// 📌 User Signup with Referral
// const userSignup = async (req, res) => {
//     try {
//         const { name, email, password, phone, preferredOtpMethod, referralCode } = req.body;
//         if (!name || !email || !password) {
//             return res.status(400).json({ message: 'name, email and password are required' });
//         }

//         const existing = await User.findOne({ email });
//         if (existing) return res.status(400).json({ message: 'Email already registered' });

//         // OTP + verification method
//         const method = (preferredOtpMethod && ['email', 'sms'].includes(preferredOtpMethod.toLowerCase()))
//             ? preferredOtpMethod.toLowerCase()
//             : 'email';
//         const willUseSms = method === 'sms' && phone;
//         const actualMethod = willUseSms ? 'sms' : 'email';

//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // generate unique referral code for this user
//         const myReferralCode = await generateUniqueReferralCode();

//         // create user object
//         const user = new User({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: 'user',
//             isManual: true,
//             isVerified: false,
//             preferredOtpMethod: actualMethod,
//             otp: { code: hashedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
//             referralCode: myReferralCode
//         });

//         let referrer = null;
//         if (referralCode) {
//             referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
//             if (!referrer) {
//                 return res.status(400).json({ message: 'Invalid referral code' });
//             }
//             if (referrer.email === email) {
//                 return res.status(400).json({ message: 'You cannot use your own referral code' });
//             }
//             user.referredBy = referrer._id;
//         }

//         await user.save();

//         // if referred, create referral record in "pending" state
//         if (referrer) {
//             await Referral.create({
//                 referrer: referrer._id,
//                 referee: user._id,
//                 status: 'pending',
//                 rewardForReferrer: 200,   // ₹200 to referrer (configurable)
//                 rewardForReferee: 200,    // ₹200 to referee
//                 minOrderAmount: 100       // order must be ≥ ₹100
//             });
//         }

//         // send OTP
//         try {
//             if (actualMethod === 'sms') {
//                 await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
//             } else {
//                 await sendEmail(email, 'Verify your account', `<p>Your verification OTP is: <b>${plainOtp}</b></p>`);
//             }
//         } catch (err) {
//             console.error('OTP send failed:', err);
//             return res.status(500).json({
//                 message: 'Signup succeeded but sending OTP failed. Please request OTP again.',
//                 error: err.message
//             });
//         }

//         // send response with referral link
//         return res.status(201).json({
//             message: 'Signup successful. OTP sent.',
//             otpSent: true,  // 🔥 add this
//             method: actualMethod,
//             email: user.email,
//             referralCode: user.referralCode,
//             referralLink: `${process.env.APP_URL || 'https://yourdomain.com'}/signup?ref=${user.referralCode}`
//         });
//     } catch (err) {
//         console.error('Signup error:', err);
//         res.status(500).json({ message: 'Signup failed', error: err.message });
//     }
// };

// const userSignup = async (req, res) => {
//     try {
//         console.log("➡️ Incoming signup request:", req.body);

//         const { name, email, password, phone, preferredOtpMethod, referralCode } = req.body;

//         if (!name || !email || !password) {
//             console.warn("⚠️ Missing required fields");
//             return res.status(400).json({ message: 'name, email and password are required' });
//         }

//         // Check if already exists
//         const existing = await User.findOne({ email });
//         if (existing) {
//             console.warn("⚠️ Email already registered:", email);
//             return res.status(400).json({ message: 'Email already registered' });
//         }

//         // OTP + verification method
//         const method = (preferredOtpMethod && ['email', 'sms'].includes(preferredOtpMethod.toLowerCase()))
//             ? preferredOtpMethod.toLowerCase()
//             : 'email';

//         const willUseSms = method === 'sms' && phone;
//         const actualMethod = willUseSms ? 'sms' : 'email';

//         console.log("📩 OTP method chosen:", actualMethod);

//         // OTP + password hashing
//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         console.log("🔑 OTP generated:", plainOtp, "(hashed not shown)");

//         // generate unique referral code for this user
//         const myReferralCode = await generateUniqueReferralCode();
//         console.log("🎟️ Generated referral code for user:", myReferralCode);

//         // create user object
//         const user = new User({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: 'user',
//             isManual: true,
//             isVerified: false,
//             preferredOtpMethod: actualMethod,
//             otp: {
//                 code: hashedOtp,
//                 expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min
//             },
//             referralCode: myReferralCode
//         });

//         let referrer = null;

//         if (referralCode) {
//             console.log("🔍 Checking referral code:", referralCode);

//             referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });

//             if (!referrer) {
//                 console.warn("⚠️ Invalid referral code:", referralCode);
//                 return res.status(400).json({ message: 'Invalid referral code' });
//             }

//             if (referrer.email === email) {
//                 console.warn("⚠️ User tried to use their own referral code");
//                 return res.status(400).json({ message: 'You cannot use your own referral code' });
//             }

//             user.referredBy = referrer._id;
//             console.log("✅ Valid referrer found:", referrer.email);
//         }

//         await user.save();
//         console.log("💾 User saved successfully:", user._id);

//         // if referred, create referral record in "pending" state
//         if (referrer) {
//             await Referral.create({
//                 referrer: referrer._id,
//                 referee: user._id,
//                 status: 'pending',
//                 rewardForReferrer: 200,   // ₹200 to referrer
//                 rewardForReferee: 200,    // ₹200 to referee
//                 minOrderAmount: 100       // order must be ≥ ₹100
//             });

//             console.log("🎯 Referral record created for referrer:", referrer._id);
//         }

//         // send OTP
//         try {
//             if (actualMethod === 'sms') {
//                 await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
//             } else {
//                 await sendEmail(
//                     email,
//                     'Verify your account',
//                     `<p>Your verification OTP is: <b>${plainOtp}</b></p>`
//                 );
//             }
//         } catch (err) {
//             console.error("❌ OTP send failed:", err);
//             return res.status(500).json({
//                 message: 'Signup succeeded but sending OTP failed. Please request OTP again.',
//                 error: err.message
//             });
//         }

//         // send response with referral link
//         const responsePayload = {
//             message: 'Signup successful. OTP sent.',
//             otpSent: true,
//             method: actualMethod,
//             email: user.email,
//             referralCode: user.referralCode,
//             referralLink: `${process.env.APP_URL || 'https://yourdomain.com'}/signup?ref=${user.referralCode}`
//         };

//         console.log("✅ Signup flow completed successfully. Response:", responsePayload);

//         return res.status(201).json(responsePayload);

//     } catch (err) {
//         console.error("🔥 Signup error:", err);
//         res.status(500).json({ message: 'Signup failed', error: err.message });
//     }
// };

// const userSignup = async (req, res) => {
//     try {
//         console.log("➡️ Incoming signup request:", req.body);

//         const { name, email, password, phone, preferredOtpMethod, referralCode } = req.body;

//         if (!name || !email || !password) {
//             console.warn("⚠️ Missing required fields");
//             return res.status(400).json({ message: 'name, email and password are required' });
//         }

//         const existing = await User.findOne({ email });
//         if (existing) {
//             console.warn("⚠️ Email already registered:", email);
//             return res.status(400).json({ message: 'Email already registered' });
//         }

//         const method = (preferredOtpMethod && ['email', 'sms'].includes(preferredOtpMethod.toLowerCase()))
//             ? preferredOtpMethod.toLowerCase()
//             : 'email';

//         const willUseSms = method === 'sms' && phone;
//         const actualMethod = willUseSms ? 'sms' : 'email';

//         console.log("📩 OTP method chosen:", actualMethod);

//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         console.log("🔑 OTP generated:", plainOtp);

//         const myReferralCode = await generateUniqueReferralCode();
//         console.log("🎟️ Generated referral code:", myReferralCode);

//         const user = new User({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: 'user',
//             isManual: true,
//             isVerified: false,
//             preferredOtpMethod: actualMethod,
//             otp: {
//                 code: hashedOtp,
//                 expiresAt: new Date(Date.now() + 10 * 60 * 1000)
//             },
//             referralCode: myReferralCode
//         });

//         let referrer = null;
//         if (referralCode) {
//             console.log("🔍 Checking referral code:", referralCode);
//             referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
//             if (!referrer) {
//                 console.warn("⚠️ Invalid referral code:", referralCode);
//                 return res.status(400).json({ message: 'Invalid referral code' });
//             }
//             if (referrer.email === email) {
//                 console.warn("⚠️ User tried to use their own referral code");
//                 return res.status(400).json({ message: 'You cannot use your own referral code' });
//             }
//             user.referredBy = referrer._id;
//             console.log("✅ Valid referrer found:", referrer.email);
//         }

//         await user.save();
//         console.log("💾 User saved successfully:", user._id);

//         if (referrer) {
//             await Referral.create({
//                 referrer: referrer._id,
//                 referee: user._id,
//                 status: 'pending',
//                 rewardForReferrer: 200,
//                 rewardForReferee: 200,
//                 minOrderAmount: 100
//             });
//             console.log("🎯 Referral record created for:", referrer._id);
//         }

//         // 🟢 Debugging ZeptoMail or SMS
//         try {
//             if (actualMethod === 'sms') {
//                 console.log("📲 Sending OTP via SMS to:", phone);
//                 await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
//                 console.log("✅ SMS sent successfully");
//             } else {
//                 console.log("📧 Preparing to send OTP email...");
//                 console.log("   SMTP_HOST:", process.env.SMTP_HOST);
//                 console.log("   SMTP_PORT:", process.env.SMTP_PORT);
//                 console.log("   SMTP_USER:", process.env.SMTP_USER);
//                 console.log("   SMTP_FROM:", process.env.SMTP_FROM);

//                 const result = await sendEmail(
//                     email,
//                     'Verify your account',
//                     `<p>Your verification OTP is: <b>${plainOtp}</b></p>`
//                 );

//                 console.log("✅ Email send result:", result);
//             }
//         } catch (err) {
//             console.error("❌ OTP send failed at transport level:", err);
//             return res.status(500).json({
//                 message: 'Signup succeeded but sending OTP failed. Please request OTP again.',
//                 error: err.message,
//                 stack: err.stack
//             });
//         }

//         const responsePayload = {
//             message: 'Signup successful. OTP sent.',
//             otpSent: true,
//             method: actualMethod,
//             email: user.email,
//             referralCode: user.referralCode,
//             referralLink: `${process.env.APP_URL || 'https://yourdomain.com'}/signup?ref=${user.referralCode}`
//         };

//         console.log("✅ Signup completed. Response:", responsePayload);
//         return res.status(201).json(responsePayload);

//     } catch (err) {
//         console.error("🔥 Signup error:", err);
//         res.status(500).json({ message: 'Signup failed', error: err.message, stack: err.stack });
//     }
// };

// const userSignup = async (req, res) => {
//     try {
//         const { name, email, password, phone, preferredOtpMethod, referralCode } = req.body;

//         if (!name || !email || !password) {
//             return res.status(400).json({ message: "name, email and password are required" });
//         }

//         const existing = await User.findOne({ email });
//         if (existing) return res.status(400).json({ message: "Email already registered" });

//         const method = (preferredOtpMethod && ["email", "sms"].includes(preferredOtpMethod.toLowerCase()))
//             ? preferredOtpMethod.toLowerCase()
//             : "email";

//         const actualMethod = method === "sms" && phone ? "sms" : "email";

//         // Generate OTP & hash password
//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         const myReferralCode = await generateUniqueReferralCode();

//         // Create user object
//         const user = new User({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: "user",
//             isManual: true,
//             isVerified: false,
//             preferredOtpMethod: actualMethod,
//             otp: { code: hashedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
//             referralCode: myReferralCode,
//         });

//         // Handle referral
//         let referrer = null;
//         if (referralCode) {
//             referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
//             if (!referrer) return res.status(400).json({ message: "Invalid referral code" });
//             if (referrer.email === email) return res.status(400).json({ message: "Cannot use own referral code" });
//             user.referredBy = referrer._id;
//         }

//         await user.save();

//         if (referrer) {
//             await Referral.create({
//                 referrer: referrer._id,
//                 referee: user._id,
//                 status: "pending",
//                 rewardForReferrer: 200,
//                 rewardForReferee: 200,
//                 minOrderAmount: 100,
//             });
//         }

//         // Send OTP via chosen method
//         try {
//             if (actualMethod === "sms") {
//                 await sendSms(phone, `Your verification OTP is: ${plainOtp}`);
//             } else {
//                 await sendEmail(
//                     email,
//                     "Verify your account",
//                     `<p>Your verification OTP is: <b>${plainOtp}</b></p>`
//                 );
//             }
//         } catch (err) {
//             console.error("❌ OTP sending failed:", err);
//             return res.status(500).json({
//                 message: "Signup succeeded but sending OTP failed. Please request OTP again.",
//                 error: err.message,
//             });
//         }

//         return res.status(201).json({
//             message: "Signup successful. OTP sent.",
//             otpSent: true,
//             method: actualMethod,
//             email: user.email,
//             referralCode: user.referralCode,
//             referralLink: `${process.env.APP_URL || "https://yourdomain.com"}/signup?ref=${user.referralCode}`,
//         });

//     } catch (err) {
//         console.error("🔥 Signup error:", err);
//         res.status(500).json({ message: "Signup failed", error: err.message });
//     }
// };


// const userLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         // 1) Validate input
//         if (!email || !password) {
//             return res.status(400).json({
//                 message: "Please enter both your email and password to log in."
//             });
//         }

//         // 2) Check user exists & role
//         const user = await User.findOne({ email });
//         if (!user || user.role !== "user") {
//             return res.status(401).json({
//                 message: "No account found with this email. Please check your email or sign up to continue."
//             });
//         }

//         // 3) Email verification check
//         if (!user.isVerified) {
//             return res.status(403).json({
//                 message: "Your email is not verified yet. Please verify your email before logging in."
//             });
//         }

//         // 4) Lockout check
//         if (user.lockUntil && user.lockUntil > new Date()) {
//             const remaining = user.lockUntil - new Date();
//             const m = Math.floor((remaining % 3600000) / 60000);
//             const s = Math.floor((remaining % 60000) / 1000);
//             return res.status(403).json({
//                 message: `Your account has been temporarily locked due to multiple failed login attempts. Please try again in ${m}m ${s}s.`
//             });
//         }

//         // 5) Password check
//         const isMatch = await user.matchPassword(password);
//         if (!isMatch) {
//             user.loginAttempts = (user.loginAttempts || 0) + 1;

//             if (user.loginAttempts >= 5) {
//                 user.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // lock 5 mins
//                 user.loginAttempts = 0;

//                 await user.save();
//                 return res.status(403).json({
//                     message: "Too many failed attempts. Your account has been locked for 5 minutes."
//                 });
//             }

//             await user.save();
//             return res.status(401).json({
//                 message: `The password you entered is incorrect. You have ${5 - user.loginAttempts} attempts left.`
//             });
//         }

//         // 6) Success
//         user.loginAttempts = 0;
//         user.lockUntil = undefined;
//         await user.save();

//         const token = generateToken(user);

//         res.cookie("token", token, {
//             httpOnly: true, // JS cannot access it → prevents XSS
//             secure: process.env.NODE_ENV === "production", // HTTPS only in production
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // cross-domain only in prod
//             maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
//         });

//         return res.status(200).json({
//             message: `Welcome back, ${user.name}!`,
//             user: {
//                 id: user._id,
//                 name: user.name,
//                 role: user.role
//             }
//         });



//     } catch (err) {
//         console.error("❌ Login error:", err);
//         return res.status(500).json({
//             message: "Something went wrong while trying to log you in. Please try again later."
//         });
//     }
// };

































// // controllers/user/userController.js
// import User from '../../models/User.js';
// import jwt from 'jsonwebtoken';
// import bcrypt from 'bcryptjs';
// import { generateOTP } from '../../middlewares/utils/generateOTP.js';
// import { sendSms } from '../../middlewares/utils/sendSms.js';

// // ====================== Helpers ====================== //
// const generateToken = (user) =>
//     jwt.sign(
//         { id: user._id, role: user.role },
//         process.env.JWT_SECRET,
//         { expiresIn: '7d' }
//     );

// // ====================== USER SECTION ===================== //

// // 📌 User Signup (OTP → SMS)
// const userSignup = async (req, res) => {
//     try {
//         const { name, email, password, phone } = req.body;

//         if (!name || !email || !password || !phone) {
//             return res.status(400).json({ message: 'Name, email, phone and password are required' });
//         }

//         const existing = await User.findOne({ $or: [{ email }, { phone }] });
//         if (existing) {
//             return res.status(400).json({ message: 'Email or phone already registered' });
//         }

//         // Generate OTP + hash
//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);
//         const hashedPassword = await bcrypt.hash(password, 10);

//         const user = await User.create({
//             name,
//             email,
//             phone,
//             password: hashedPassword,
//             role: 'user',
//             isManual: true,
//             isVerified: false,
//             otp: {
//                 code: hashedOtp,
//                 expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min
//             }
//         });

//         // Send OTP via SMS
//         await sendSms(phone, `Your verification OTP is: ${plainOtp}`);

//         res.status(201).json({
//             message: 'Signup successful. OTP sent to phone.',
//             phone: user.phone
//         });
//     } catch (err) {
//         console.error('Signup error:', err);
//         res.status(500).json({ message: 'Signup failed', error: err.message });
//     }
// };

// // 📌 Verify OTP (Signup / Login)
// const verifyOtp = async (req, res) => {
//     try {
//         const { phone, otp } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         if (!user.otp || !user.otp.code) {
//             return res.status(400).json({ message: 'No OTP requested' });
//         }

//         if (user.otp.expiresAt < new Date()) {
//             return res.status(400).json({ message: 'OTP expired' });
//         }

//         const isMatch = await bcrypt.compare(otp, user.otp.code);
//         if (!isMatch) {
//             return res.status(400).json({ message: 'Invalid OTP' });
//         }

//         user.isVerified = true;
//         user.otp = undefined;
//         await user.save();

//         const token = generateToken(user);

//         res.json({ message: 'OTP verified successfully', token });
//     } catch (err) {
//         console.error('Verify OTP error:', err);
//         res.status(500).json({ message: 'Failed to verify OTP', error: err.message });
//     }
// };

// // 📌 User Login with Email + Password
// const userLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         const user = await User.findOne({ email });
//         if (!user || user.role !== 'user') {
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         if (!user.isVerified) {
//             return res.status(403).json({ message: 'Please verify your phone before logging in.' });
//         }

//         const isMatch = await user.matchPassword(password);
//         if (!isMatch) {
//             return res.status(401).json({ message: 'Invalid credentials' });
//         }

//         const token = generateToken(user);

//         res.status(200).json({
//             token,
//             user: { id: user._id, name: user.name, role: user.role }
//         });
//     } catch (err) {
//         console.error('Login error:', err);
//         res.status(500).json({ message: 'Login failed', error: err.message });
//     }
// };

// // 📌 Login with Phone → Send OTP
// const loginWithPhone = async (req, res) => {
//     try {
//         const { phone } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);

//         user.otp = {
//             code: hashedOtp,
//             expiresAt: new Date(Date.now() + 10 * 60 * 1000)
//         };
//         await user.save();

//         await sendSms(phone, `Your login OTP is: ${plainOtp}`);

//         res.json({ message: 'OTP sent to phone' });
//     } catch (err) {
//         console.error('Phone login error:', err);
//         res.status(500).json({ message: 'Login via phone failed', error: err.message });
//     }
// };

// // 📌 Forgot Password (via phone OTP)
// const forgotPassword = async (req, res) => {
//     try {
//         const { phone } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         const plainOtp = generateOTP();
//         const hashedOtp = await bcrypt.hash(plainOtp, 10);

//         user.otp = {
//             code: hashedOtp,
//             expiresAt: new Date(Date.now() + 10 * 60 * 1000)
//         };
//         await user.save();

//         await sendSms(phone, `Your password reset OTP is: ${plainOtp}`);

//         res.json({ message: 'OTP sent for password reset' });
//     } catch (err) {
//         console.error('Forgot password error:', err);
//         res.status(500).json({ message: 'Failed to send OTP', error: err.message });
//     }
// };

// // 📌 Reset Password (after verifying OTP)
// const resetPassword = async (req, res) => {
//     try {
//         const { phone, otp, newPassword } = req.body;

//         const user = await User.findOne({ phone });
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         if (!user.otp || !user.otp.code) {
//             return res.status(400).json({ message: 'No OTP requested' });
//         }

//         if (user.otp.expiresAt < new Date()) {
//             return res.status(400).json({ message: 'OTP expired' });
//         }

//         const isMatch = await bcrypt.compare(otp, user.otp.code);
//         if (!isMatch) {
//             return res.status(400).json({ message: 'Invalid OTP' });
//         }

//         user.password = await bcrypt.hash(newPassword, 10);
//         user.otp = undefined;
//         await user.save();

//         res.json({ message: 'Password reset successful' });
//     } catch (err) {
//         console.error('Reset password error:', err);
//         res.status(500).json({ message: 'Failed to reset password', error: err.message });
//     }
// };

// const trackProductView = async (req, res) => { try { const { productId, category } = req.body; const userId = req.user._id; if (!productId || !category) { return res.status(400).json({ message: "Product ID and category are required" }); } await User.findByIdAndUpdate(userId, { $pull: { recentProducts: productId, recentCategories: category } }); await User.findByIdAndUpdate(userId, { $push: { recentProducts: { $each: [productId], $position: 0, $slice: 20 }, recentCategories: { $each: [category], $position: 0, $slice: 20 } } }, { new: true }); res.json({ message: "User activity updated successfully" }); } catch (error) { console.error(error); res.status(500).json({ message: "Error updating user activity" }); } };

// export {
//     userSignup,
//     verifyOtp,
//     userLogin,
//     loginWithPhone,
//     forgotPassword,
//     resetPassword,
//     trackProductView
// };


















