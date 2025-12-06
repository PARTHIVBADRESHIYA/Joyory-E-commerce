// import AffiliateUser from "../models/AffiliateUser.js";
// import AffiliateLink from "../models/AffiliateLink.js";
// import AffiliateEarning from "../models/AffiliateEarning.js";
// import AffiliatePayout from "../models/AffiliatePayout.js";
// import AffiliateOrder from "../models/AffiliateOrder.js";
// import jwt from "jsonwebtoken";
// import Product from "../models/Product.js";


// // ------------------------------
// // Generate JWT
// // ------------------------------
// const generateToken = (id) => {
//     return jwt.sign({ id }, process.env.JWT_SECRET, {
//         expiresIn: "7d",
//     });
// };


// // ------------------------------
// // 1. Affiliate Signup
// // ------------------------------
// export const affiliateSignup = async (req, res) => {
//     try {
//         const { fullName, email, password, mobile } = req.body;

//         const exists = await AffiliateUser.findOne({ email });
//         if (exists) {
//             return res.status(400).json({ message: "Email already registered" });
//         }

//         const affiliateId = Math.random().toString(36).substring(2, 10);
//         const referralCode = "JOY" + Math.floor(100000 + Math.random() * 900000);

//         const user = await AffiliateUser.create({
//             fullName,
//             email,
//             password,
//             mobile,
//             affiliateId,
//             referralCode,
//         });

//         return res.status(201).json({
//             success: true,
//             token: generateToken(user._id),
//             user,
//         });

//     } catch (err) {
//         console.error("Signup error:", err);
//         res.status(500).json({ message: "Server error", err: err.message });
//     }
// };


// // ------------------------------
// // 2. Affiliate Login
// // ------------------------------
// export const affiliateLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         const user = await AffiliateUser.findOne({ email });
//         if (!user) {
//             return res.status(404).json({ message: "Affiliate not found" });
//         }

//         const matched = await user.comparePassword(password);
//         if (!matched) {
//             return res.status(400).json({ message: "Invalid password" });
//         }

//         return res.status(200).json({
//             success: true,
//             token: generateToken(user._id),
//             user,
//         });

//     } catch (err) {
//         console.error("Login error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };


// // ------------------------------
// // 3. Create Affiliate Link
// // ------------------------------
// export const createAffiliateLink = async (req, res) => {
//     try {
//         const affiliateUser = req.affiliate;
//         const { linkName, productId, externalUrl } = req.body;

//         const slug = "AFF_" + Math.random().toString(36).substring(2, 8);

//         let productSnapshot = {};

//         if (productId) {
//             const product = await Product.findById(productId).select("title price images");
//             if (!product) {
//                 return res.status(404).json({ message: "Product not found" });
//             }

//             productSnapshot = {
//                 title: product.title,
//                 price: product.price,
//                 image: product.images?.[0] || null,
//             };
//         }

//         // 🔥 This is the public affiliate link (tracking URL)
//         const shareUrl = `${process.env.APP_URL}/aff/${slug}`;

//         const link = await AffiliateLink.create({
//             affiliateUser: affiliateUser._id,
//             linkName,
//             productId: productId || null,
//             externalUrl: externalUrl || null,
//             slug,
//             shareUrl,
//             meta: productSnapshot,
//         });

//         return res.status(201).json({
//             success: true,
//             message: "Affiliate link created successfully.",
//             link
//         });

//     } catch (err) {
//         console.error("Create Link error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };


// // ------------------------------
// // 4. Get All Links of this Affiliate
// // ------------------------------
// export const getMyAffiliateLinks = async (req, res) => {
//     try {
//         const affiliateUser = req.affiliate;

//         const links = await AffiliateLink.find({ affiliateUser: affiliateUser._id })
//             .sort({ createdAt: -1 });

//         return res.status(200).json({ success: true, links });

//     } catch (err) {
//         console.error("Fetch links error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };


// // ------------------------------
// // 5. Track Clicks /aff/:slug
// // ------------------------------
// export const trackClick = async (req, res) => {
//     try {
//         const { slug } = req.params;

//         const link = await AffiliateLink.findOne({ slug });
//         if (!link) return res.status(404).json({ message: "Invalid affiliate link" });

//         // Track click count
//         link.clickCount += 1;
//         await link.save();

//         // Track clicks on affiliate user
//         await AffiliateUser.findByIdAndUpdate(link.affiliateUser, {
//             $inc: { clicks: 1 }
//         });

//         // Set affiliate cookie
//         res.cookie("aff_slug", slug, {
//             httpOnly: true,
//             secure: true,
//             sameSite: "None",
//             maxAge: 7 * 24 * 60 * 60 * 1000
//         });

//         // 🔥 FINAL REDIRECTION LOGIC
//         if (link.productId) {
//             // Redirect to product page EXACTLY as you want
//             return res.redirect(`${process.env.APP_URL}product/${link.productId}`);
//         }

//         if (link.externalUrl) {
//             return res.redirect(link.externalUrl);
//         }

//         return res.redirect(process.env.APP_URL);

//     } catch (err) {
//         console.error("Click tracking error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };



// // ------------------------------
// // 6. Get Affiliate Dashboard Stats
// // ------------------------------
// export const getAffiliateStats = async (req, res) => {
//     try {
//         const user = req.affiliate;

//         return res.status(200).json({
//             success: true,
//             clicks: user.clicks,
//             orders: user.orders,
//             sales: user.sales,
//             totalCommission: user.totalCommission,
//             bonus: user.orders * 180, // you can change bonus logic
//         });

//     } catch (err) {
//         console.error("Stats error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };


// export const getAffiliateOrders = async (req, res) => {
//     try {
//         const orders = await AffiliateOrder.find({
//             affiliateUser: req.affiliate._id
//         })
//             .populate("orderId", "orderNumber amount orderStatus createdAt")
//             .populate("affiliateLink", "slug linkName meta")
//             .sort({ createdAt: -1 });

//         return res.status(200).json({
//             success: true,
//             count: orders.length,
//             orders
//         });

//     } catch (err) {
//         console.error("Get affiliate orders error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };


// export const getPayouts = async (req, res) => {
//     try {
//         const payouts = await AffiliatePayout.find({
//             affiliateUser: req.affiliate._id
//         })
//             .populate("earnings", "orderNumber commission orderAmount")
//             .sort({ createdAt: -1 });

//         const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);

//         return res.status(200).json({
//             success: true,
//             totalPaid,
//             payouts
//         });

//     } catch (err) {
//         console.error("Payout fetch error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };






// // ----------------------------------------------
// // 1️⃣ Get all pending affiliate commissions
// // ----------------------------------------------
// export const getPendingCommissions = async (req, res) => {
//     try {
//         const list = await AffiliateEarning.find({ status: "pending" })
//             .populate("affiliateUser", "fullName email")
//             .populate("affiliateLink", "slug linkName meta")
//             .populate("orderId", "orderNumber amount createdAt")
//             .sort({ createdAt: -1 });

//         return res.status(200).json({ success: true, list });

//     } catch (err) {
//         console.error("Admin fetch pending commissions error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };



// // ----------------------------------------------
// // 2️⃣ Approve a commission
// // ----------------------------------------------
// export const approveCommission = async (req, res) => {
//     try {
//         const { earningId } = req.body;

//         const earning = await AffiliateEarning.findById(earningId);
//         if (!earning) return res.status(404).json({ message: "Earning not found" });

//         if (earning.status !== "pending") {
//             return res.status(400).json({ message: "Already processed" });
//         }

//         // 1. Update commission status
//         earning.status = "approved";
//         await earning.save();

//         // 2. Update AffiliateUser wallet + counters
//         await AffiliateUser.findByIdAndUpdate(earning.affiliateUser, {
//             $inc: {
//                 walletBalance: earning.commission,
//                 totalCommission: earning.commission,
//                 lifetimeEarnings: earning.commission,
//                 sales: earning.orderAmount,
//                 orders: 1
//             }
//         });

//         // 3. Update AffiliateOrder record
//         await AffiliateOrder.findOneAndUpdate(
//             { orderId: earning.orderId },
//             { status: "confirmed" }
//         );

//         return res.status(200).json({
//             success: true,
//             message: "Commission approved"
//         });

//     } catch (err) {
//         console.error("Approve commission error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };



// // ----------------------------------------------
// // 3️⃣ Reject a commission
// // ----------------------------------------------
// export const rejectCommission = async (req, res) => {
//     try {
//         const { earningId, note } = req.body;

//         const earning = await AffiliateEarning.findById(earningId);
//         if (!earning) return res.status(404).json({ message: "Earning not found" });

//         if (earning.status !== "pending") {
//             return res.status(400).json({ message: "Earning already processed" });
//         }

//         earning.status = "rejected";
//         earning.note = note || "Rejected by admin";
//         await earning.save();

//         res.status(200).json({ success: true, message: "Commission rejected" });

//     } catch (err) {
//         console.error("Admin reject commission error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };



// // ----------------------------------------------
// // 4️⃣ Mark selected commissions as PAID
// // ----------------------------------------------
// export const payAffiliate = async (req, res) => {
//     try {
//         const { affiliateUserId, earningIds, amount, method, note } = req.body;

//         const affiliate = await AffiliateUser.findById(affiliateUserId);
//         if (!affiliate) return res.status(404).json({ message: "Affiliate not found" });

//         // Approvals only
//         const earnings = await AffiliateEarning.find({
//             _id: { $in: earningIds },
//             status: "approved"
//         });

//         if (earnings.length === 0) {
//             return res.status(400).json({ message: "No approved earnings selected" });
//         }

//         // Mark all as paid
//         await AffiliateEarning.updateMany(
//             { _id: { $in: earningIds } },
//             { $set: { status: "paid" } }
//         );

//         // Update AffiliateOrder records
//         await AffiliateOrder.updateMany(
//             { orderId: { $in: earnings.map(e => e.orderId) } },
//             { $set: { status: "paid" } }
//         );

//         // Create payout log
//         const payout = await AffiliatePayout.create({
//             affiliateUser: affiliateUserId,
//             amount,
//             method,
//             note,
//             earnings: earningIds
//         });

//         // Reduce wallet
//         affiliate.walletBalance -= amount;
//         await affiliate.save();

//         return res.status(200).json({ success: true, payout });

//     } catch (err) {
//         console.error("Pay affiliate error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ----------------------------------------------
// // 5️⃣ Get Affiliate Payout History (Admin)
// // ----------------------------------------------
// export const getPayoutHistory = async (req, res) => {
//     try {
//         const list = await AffiliatePayout.find()
//             .populate("affiliateUser", "fullName email")
//             .populate("earnings", "orderNumber commission")
//             .sort({ createdAt: -1 });

//         res.status(200).json({ success: true, list });

//     } catch (err) {
//         console.error("Admin payout history error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };



// // ----------------------------------------------
// // 6️⃣ Admin: Summary dashboard for affiliate module
// // ----------------------------------------------
// export const adminAffiliateSummary = async (req, res) => {
//     try {
//         const totalUsers = await AffiliateUser.countDocuments();
//         const totalEarnings = await AffiliateEarning.aggregate([
//             { $group: { _id: null, amount: { $sum: "$commission" } } }
//         ]);

//         const pending = await AffiliateEarning.countDocuments({ status: "pending" });
//         const approved = await AffiliateEarning.countDocuments({ status: "approved" });
//         const paid = await AffiliateEarning.countDocuments({ status: "paid" });

//         res.status(200).json({
//             success: true,
//             stats: {
//                 totalUsers,
//                 totalEarnings: totalEarnings[0]?.amount || 0,
//                 pending,
//                 approved,
//                 paid
//             }
//         });

//     } catch (err) {
//         console.error("Admin affiliate summary error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

































// controllers/affiliateController.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";

import AffiliateUser from "../models/AffiliateUser.js";
import AffiliateLink from "../models/AffiliateLink.js";
import AffiliateEarning from "../models/AffiliateEarning.js";
import AffiliateOrder from "../models/AffiliateOrder.js";
import AffiliatePayout from "../models/AffiliatePayout.js";
import Product from "../models/Product.js";
import Razorpay from "razorpay";
import { sendEmail } from "../middlewares/utils/emailService.js";
const JWT_EXP = "7d";
const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: JWT_EXP });

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});


/**
 * Helper: safe number
 */
const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/* ----------------------------------------
AFFILIATE -> AUTH
-----------------------------------------*/
export const affiliateSignup = async (req, res) => {
    try {
        const { fullName, email, password, mobile } = req.body;
        if (!fullName || !email || !password) {
            return res.status(400).json({ success: false, message: "fullName, email and password are required" });
        }

        const exists = await AffiliateUser.findOne({ email });
        if (exists) return res.status(400).json({ success: false, message: "Email already registered" });

        const affiliateId = Math.random().toString(36).substring(2, 10);
        const referralCode = "JOY" + Math.floor(100000 + Math.random() * 900000);

        const user = await AffiliateUser.create({
            fullName,
            email,
            password,
            mobile,
            affiliateId,
            referralCode,
        });

        const token = makeToken(user._id);
        return res.status(201).json({ success: true, token, user });
    } catch (err) {
        console.error("affiliateSignup error:", err);
        return res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};

export const affiliateLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "email & password required" });

        const user = await AffiliateUser.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "Affiliate not found" });

        const matched = await user.comparePassword(password);
        if (!matched) return res.status(401).json({ success: false, message: "Invalid credentials" });

        const token = makeToken(user._id);
        return res.status(200).json({ success: true, token, user });
    } catch (err) {
        console.error("affiliateLogin error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/* ----------------------------------------
   CREATE LINK / LIST LINKS / TRACK CLICK
-----------------------------------------*/
export const createAffiliateLink = async (req, res) => {
    try {
        const affiliateUser = req.affiliate;
        if (!affiliateUser) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { linkName = "", productId = null, externalUrl = null } = req.body;

        let productSnapshot = {};
        if (productId) {
            const product = await Product.findById(productId).select("name title price images price brand");
            if (!product) return res.status(404).json({ success: false, message: "Product not found" });

            productSnapshot = {
                title: product.title || product.name || "",
                price: product.price ?? 0,
                image: (product.images && product.images[0]) || null,
                brand: product.brand || null,
            };
        }

        const slug = "AFF_" + Math.random().toString(36).substring(2, 8);
        const shareUrl = `${process.env.APP_URL}/aff/${slug}`;

        const link = await AffiliateLink.create({
            affiliateUser: affiliateUser._id,
            linkName,
            productId: productId || null,
            externalUrl: externalUrl || null,
            slug,
            shareUrl,
            meta: productSnapshot,
        });

        return res.status(201).json({ success: true, message: "Affiliate link created", link });
    } catch (err) {
        console.error("createAffiliateLink error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const quickCreateAffiliateLink = async (req, res) => {
    try {
        const affiliateUser = req.affiliate;
        const { productId } = req.body;

        if (!productId)
            return res.status(400).json({ success: false, message: "productId required" });

        const product = await Product.findById(productId).select("title price images brand");
        if (!product)
            return res.status(404).json({ success: false, message: "Product not found" });

        const slug = "AFF_" + Math.random().toString(36).substring(2, 8);

        const link = await AffiliateLink.create({
            affiliateUser: affiliateUser._id,
            linkName: product.title,
            productId,
            slug,
            shareUrl: `${process.env.APP_URL}/aff/${slug}`,
            meta: {
                title: product.title,
                price: product.price,
                brand: product.brand
            }
        });

        return res.status(201).json({
            success: true,
            message: "Link Ready",
            link: link.shareUrl,
            slug
        });

    } catch (error) {
        console.log("quickCreateAffiliateLink error", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getMyAffiliateLinks = async (req, res) => {
    try {
        const affiliateUser = req.affiliate;
        if (!affiliateUser) return res.status(401).json({ success: false, message: "Unauthorized" });

        const links = await AffiliateLink.find({ affiliateUser: affiliateUser._id }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, count: links.length, links });
    } catch (err) {
        console.error("getMyAffiliateLinks error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Public tracking endpoint: /aff/:slug
 * - increments counters
 * - saves cookie
 * - redirects to product or external url
 * - returns JSON when Accept: application/json (Postman)
 */
export const trackClick = async (req, res) => {
    try {
        const { slug } = req.params;
        const link = await AffiliateLink.findOne({ slug });
        if (!link) return res.status(404).json({ success: false, message: "Invalid affiliate link" });

        // increment link's clickCount
        link.clickCount = (link.clickCount || 0) + 1;
        await link.save().catch(() => null);

        // increment affiliate user's clicks
        await AffiliateUser.findByIdAndUpdate(link.affiliateUser, { $inc: { clicks: 1 } }).catch(() => null);

        // set cookie (sameSite None for cross-site, secure only if https)
        res.cookie("aff_slug", slug, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // decide final URL
        let finalUrl = process.env.APP_URL || "/";
        if (link.productId) finalUrl = `${process.env.APP_URL}product/${link.productId}`;
        else if (link.externalUrl) finalUrl = link.externalUrl;

        // If API client expects JSON, return JSON instead of redirect
        const accept = String(req.headers.accept || "");
        if (accept.includes("application/json") || accept.includes("text/json")) {
            return res.status(200).json({ success: true, message: "Affiliate click tracked", redirectTo: finalUrl });
        }

        // Otherwise redirect (browser)
        return res.redirect(finalUrl);
    } catch (err) {
        console.error("trackClick error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/* ----------------------------------------
   AFFILIATE DASHBOARD (user-side)
-----------------------------------------*/
export const getAffiliateStats = async (req, res) => {
    try {
        const user = await AffiliateUser.findById(req.affiliate._id).lean();
        if (!user) return res.status(404).json({ success: false, message: "Affiliate not found" });

        // compute earnings summary
        const agg = await AffiliateEarning.aggregate([
            { $match: { affiliateUser: new mongoose.Types.ObjectId(user._id) } },
            { $group: { _id: "$status", total: { $sum: "$commission" }, count: { $sum: 1 } } }
        ]);

        const summary = { pending: 0, approved: 0, paid: 0, rejected: 0 };
        agg.forEach(a => { summary[a._id] = a.total || 0; });

        return res.status(200).json({
            success: true,
            stats: {
                clicks: user.clicks || 0,
                orders: user.orders || 0,
                sales: user.sales || 0,
                walletBalance: user.walletBalance || 0,
                lifetimeEarnings: user.lifetimeEarnings || 0,
                earningsSummary: summary
            }
        });
    } catch (err) {
        console.error("getAffiliateStats error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET /affiliate/orders
 * returns AffiliateOrder entries for the affiliate user with populated order meta
 */
export const getAffiliateOrders = async (req, res) => {
    try {
        const affiliateUserId = req.affiliate._id;
        const orders = await AffiliateOrder.find({ affiliateUser: affiliateUserId })
            .populate("orderId", "orderNumber amount orderStatus createdAt user")
            .populate("affiliateLink", "slug linkName meta")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, count: orders.length, orders });
    } catch (err) {
        console.error("getAffiliateOrders error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET /affiliate/earnings
 * returns grouped earnings for the affiliate user
 */
export const getAffiliateEarnings = async (req, res) => {
    try {
        const affiliateUserId = req.affiliate._id;

        const earnings = await AffiliateEarning.find({ affiliateUser: affiliateUserId })
            .populate("orderId", "orderNumber amount orderStatus createdAt")
            .populate("affiliateLink", "slug linkName meta")
            .sort({ createdAt: -1 });

        // group by status
        const grouped = earnings.reduce((acc, e) => {
            acc[e.status] = acc[e.status] || [];
            acc[e.status].push(e);
            return acc;
        }, {});

        return res.status(200).json({
            success: true,
            totals: {
                totalEarnings: earnings.reduce((s, x) => s + (x.commission || 0), 0),
                pending: (grouped.pending || []).length,
                approved: (grouped.approved || []).length,
                paid: (grouped.paid || []).length,
                rejected: (grouped.rejected || []).length
            },
            earnings: grouped
        });
    } catch (err) {
        console.error("getAffiliateEarnings error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET /affiliate/payouts
 * list payouts for affiliate user
 */
export const getAffiliatePayouts = async (req, res) => {
    try {
        const affiliateUserId = req.affiliate._id;
        const payouts = await AffiliatePayout.find({ affiliateUser: affiliateUserId })
            .populate("earnings", "orderNumber commission orderAmount")
            .sort({ createdAt: -1 });

        const totalPaid = payouts.reduce((s, p) => s + (p.amount || 0), 0);
        return res.status(200).json({ success: true, totalPaid, payouts });
    } catch (err) {
        console.error("getAffiliatePayouts error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/* ----------------------------------------
   ADMIN SIDE ENDPOINTS
-----------------------------------------*/

/**
 * GET /admin/users
 * list all affiliate users (optionally with filters)
 */
export const adminGetUsers = async (req, res) => {
    try {
        const q = {};
        if (req.query.isActive) q.isActive = req.query.isActive === "true";
        if (req.query.isApproved) q.isApproved = req.query.isApproved === "true";
        const users = await AffiliateUser.find(q).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, count: users.length, users });
    } catch (err) {
        console.error("adminGetUsers error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET /admin/user/:id
 * get single affiliate user details + stats
 */
export const adminGetUserDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await AffiliateUser.findById(id).lean();
        if (!user) return res.status(404).json({ success: false, message: "Affiliate not found" });

        const earnings = await AffiliateEarning.find({ affiliateUser: id }).sort({ createdAt: -1 });
        const orders = await AffiliateOrder.find({ affiliateUser: id }).populate("orderId", "orderNumber amount orderStatus").sort({ createdAt: -1 });

        return res.status(200).json({ success: true, user, earningsCount: earnings.length, ordersCount: orders.length, earnings, orders });
    } catch (err) {
        console.error("adminGetUserDetails error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET /admin/commissions
 * fetch earnings (with filters)
 * query params: status, affiliateUser, from, to, page, limit
 */
export const adminGetCommissions = async (req, res) => {
    try {
        const { status, affiliateUser, from, to, page = 1, limit = 50 } = req.query;
        const q = {};
        if (status) q.status = status;
        if (affiliateUser) q.affiliateUser = affiliateUser;
        if (from || to) {
            q.createdAt = {};
            if (from) q.createdAt.$gte = new Date(from);
            if (to) q.createdAt.$lte = new Date(to);
        }

        const skip = (Number(page) - 1) * Number(limit);
        const list = await AffiliateEarning.find(q)
            .populate("affiliateUser", "fullName email mobile walletBalance")
            .populate("affiliateLink", "slug linkName meta")
            .populate("orderId", "orderNumber amount orderStatus createdAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await AffiliateEarning.countDocuments(q);
        return res.status(200).json({ success: true, total, page: Number(page), limit: Number(limit), list });
    } catch (err) {
        console.error("adminGetCommissions error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * POST /admin/commissions/approve
 * body: { earningId }
 */
// export const adminApproveCommission = async (req, res) => {
//     try {
//         const { earningId } = req.body;
//         if (!earningId) return res.status(400).json({ success: false, message: "earningId required" });

//         const earning = await AffiliateEarning.findById(earningId);
//         if (!earning) return res.status(404).json({ success: false, message: "Earning not found" });
//         if (earning.status !== "pending") return res.status(400).json({ success: false, message: "Earning already processed" });

//         // mark earning approved
//         earning.status = "approved";
//         await earning.save();

//         // update affiliate user counters and wallet (increment wallet only on approve)
//         await AffiliateUser.findByIdAndUpdate(earning.affiliateUser, {
//             $inc: {
//                 walletBalance: earning.commission,
//                 totalCommission: earning.commission,
//                 lifetimeEarnings: earning.commission,
//                 orders: 1,
//                 sales: earning.orderAmount
//             }
//         });

//         // update affiliateOrder status if exists
//         await AffiliateOrder.findOneAndUpdate({ orderId: earning.orderId }, { status: "confirmed" }).catch(() => null);

//         return res.status(200).json({ success: true, message: "Commission approved" });
//     } catch (err) {
//         console.error("adminApproveCommission error:", err);
//         return res.status(500).json({ success: false, message: "Server error" });
//     }
// };


/**
 * POST /admin/commissions/reject
 * body: { earningId, note }
 */
export const adminRejectCommission = async (req, res) => {
    try {
        const { earningId, note } = req.body;
        if (!earningId) return res.status(400).json({ success: false, message: "earningId required" });

        const earning = await AffiliateEarning.findById(earningId);
        if (!earning) return res.status(404).json({ success: false, message: "Earning not found" });
        if (earning.status !== "pending") return res.status(400).json({ success: false, message: "Earning already processed" });

        earning.status = "rejected";
        earning.note = note || "Rejected by admin";
        await earning.save();

        // mark affiliateOrder cancelled if exists
        await AffiliateOrder.findOneAndUpdate({ orderId: earning.orderId }, { status: "cancelled" }).catch(() => null);

        return res.status(200).json({ success: true, message: "Commission rejected" });
    } catch (err) {
        console.error("adminRejectCommission error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * POST /admin/pay
 * body: { affiliateUserId, earningIds:[], amount, method, note }
 * Marks earnings as paid, creates payout record, updates affiliate wallet.
 */
export const adminPayAffiliate = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { affiliateUserId, earningIds = [], amount = 0, method = "manual", note = "" } = req.body;
        if (!affiliateUserId || !Array.isArray(earningIds) || earningIds.length === 0) {
            return res.status(400).json({ success: false, message: "affiliateUserId and earningIds are required" });
        }

        // ensure selected earnings are approved
        const earnings = await AffiliateEarning.find({ _id: { $in: earningIds }, status: "approved" });
        if (!earnings || earnings.length === 0) {
            return res.status(400).json({ success: false, message: "No approved earnings found to pay" });
        }

        await session.withTransaction(async () => {
            // mark earnings paid
            await AffiliateEarning.updateMany({ _id: { $in: earningIds } }, { $set: { status: "paid" } }, { session });

            // update affiliateOrder records to paid
            const orderIds = earnings.map(e => e.orderId);
            await AffiliateOrder.updateMany({ orderId: { $in: orderIds } }, { $set: { status: "paid" } }, { session });

            // create payout log
            const payout = await AffiliatePayout.create([{
                affiliateUser: affiliateUserId,
                amount,
                method,
                note,
                earnings: earningIds
            }], { session }).then(d => d[0]);

            // deduct walletBalance
            await AffiliateUser.findByIdAndUpdate(affiliateUserId, { $inc: { walletBalance: -amount } }, { session });

            return payout;
        });

        await session.endSession();
        return res.status(200).json({ success: true, message: "Affiliate paid" });
    } catch (err) {
        await session.endSession().catch(() => null);
        console.error("adminPayAffiliate error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET /admin/payouts
 */
export const adminGetPayoutHistory = async (req, res) => {
    try {
        const list = await AffiliatePayout.find()
            .populate("affiliateUser", "fullName email")
            .populate("earnings", "orderNumber commission orderAmount")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, count: list.length, list });
    } catch (err) {
        console.error("adminGetPayoutHistory error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET /admin/summary
 */
export const adminAffiliateSummary = async (req, res) => {
    try {
        // ---------- BASIC COUNTS ----------
        const totalAffiliates = await AffiliateUser.countDocuments();
        const activeAffiliates = await AffiliateUser.countDocuments({ isApproved: "true" });
        const pendingApprovals = await AffiliateUser.countDocuments({ isApproved: "false" });

        // ---------- TOTAL EARNINGS ----------
        const totalEarningsAgg = await AffiliateEarning.aggregate([
            { $group: { _id: null, total: { $sum: "$commission" }, } }
        ]);
        const totalEarnings = totalEarningsAgg[0]?.total || 0;

        // ---------- TOTAL CLICKS / ORDERS / CONVERSION ----------
        const perfAgg = await AffiliateUser.aggregate([
            {
                $group: {
                    _id: null,
                    totalClicks: { $sum: "$clicks" },
                    totalOrders: { $sum: "$orders" },
                    totalEarnings: { $sum: "$lifetimeEarnings" },
                    affiliates: { $push: "$$ROOT" }
                }
            }
        ]);

        const totalClicks = perfAgg[0]?.totalClicks || 0;
        const totalOrders = perfAgg[0]?.totalOrders || 0;
        const conversionRate = totalClicks > 0 ? Number(((totalOrders / totalClicks) * 100).toFixed(1)) : 0;
        const avgEarnings = totalAffiliates > 0 ? Math.round(totalEarnings / totalAffiliates) : 0;

        // ---------- EARNINGS DISTRIBUTION ----------
        const earningsDistribution = await AffiliateUser.find()
            .select("fullName lifetimeEarnings email")
            .sort({ lifetimeEarnings: -1 });

        // ---------- TOP AFFILIATES PERFORMANCE TABLE ----------
        const topAffiliates = await AffiliateUser.find()
            .sort({ lifetimeEarnings: -1 })
            .limit(10)
            .select("fullName email clicks orders lifetimeEarnings");

        const tableData = topAffiliates.map((x, idx) => ({
            rank: idx + 1,
            name: x.fullName,
            email: x.email,
            clicks: x.clicks,
            orders: x.orders,
            earnings: x.lifetimeEarnings,
            conversion: x.clicks > 0 ? Number((x.orders / x.clicks * 100).toFixed(1)) : 0
        }));

        // ---------- PAID OUT ----------
        const paidOut = await AffiliateEarning.aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: null, total: { $sum: "$commission" } } }
        ]);
        const totalPaid = paidOut[0]?.total || 0;

        // ---------- ACTIVE RATE ----------
        const activeRate = totalAffiliates > 0
            ? Number(((activeAffiliates / totalAffiliates) * 100).toFixed(1))
            : 0;


        // ---------- SEND FINAL RESPONSE ----------
        return res.status(200).json({
            success: true,

            overviewCards: {
                totalAffiliates,
                totalEarnings,
                pendingApprovals,
                approvedAffiliates: activeAffiliates,
                avgEarnings,
                totalClicks,
                totalOrders,
                conversionRate
            },

            topAffiliateTable: tableData,

            performanceMetrics: {
                avgEarnings,
                conversionRate,
                totalClicks,
                totalOrders,
                earningsDistribution
            },

            affiliateOverview: {
                totalAffiliates,
                activeAffiliates,
                pendingApprovals,
                totalCommission: totalEarnings,
                summary: `Your affiliate program has generated ₹${totalEarnings} from ${activeAffiliates} active affiliates. Top performers are driving ${totalClicks} clicks and ${totalOrders} conversions.`,
            },

            quickActionsStats: {
                avgEarnings,
                paidOut: totalPaid,
                activeRate
            },

            lastUpdated: new Date()
        });

    } catch (err) {
        console.error("adminAffiliateDashboard error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// export const adminApproveCommission = async (req, res) => {
//     try {
//         const { earningId } = req.body;
//         if (!earningId)
//             return res.status(400).json({ success: false, message: "earningId required" });

//         const earning = await AffiliateEarning.findById(earningId);
//         if (!earning)
//             return res.status(404).json({ success: false, message: "Earning not found" });

//         if (earning.status !== "pending")
//             return res.status(400).json({ success: false, message: "Earning already processed" });

//         // Approve earning
//         earning.status = "approved";
//         await earning.save();

//         // Update affiliate user counters
//         await AffiliateUser.findByIdAndUpdate(earning.affiliateUser, {
//             $inc: {
//                 walletBalance: earning.commission,
//                 totalCommission: earning.commission,
//                 lifetimeEarnings: earning.commission,
//                 orders: 1,
//                 sales: earning.orderAmount
//             }
//         });

//         // Update affiliate order
//         await AffiliateOrder.findOneAndUpdate(
//             { orderId: earning.orderId },
//             { status: "confirmed" }
//         ).catch(() => null);

//         return res.status(200).json({
//             success: true,
//             message: "Commission approved successfully"
//         });

//     } catch (err) {
//         console.error("adminApproveCommission error:", err);
//         return res.status(500).json({ success: false, message: "Server error" });
//     }
// };

// export const adminCreateCommissionPayoutOrder = async (req, res) => {
//     try {
//         const { earningId } = req.body;
//         if (!earningId)
//             return res.status(400).json({ success: false, message: "earningId required" });

//         const earning = await AffiliateEarning.findById(earningId);
//         if (!earning)
//             return res.status(404).json({ success: false, message: "Earning not found" });

//         // Must be approved before user can pay
//         if (earning.status !== "approved") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Commission MUST be approved first."
//             });
//         }

//         const receipt = `affiliate_${earning.affiliateUser}_${Date.now()}`;

//         // Create Razorpay order
//         const order = await razorpay.orders.create({
//             amount: earning.commission * 100,
//             currency: "INR",
//             receipt,
//             notes: {
//                 earningId,
//                 affiliateUserId: earning.affiliateUser
//             }
//         });

//         return res.status(200).json({
//             success: true,
//             message: "Razorpay order created",
//             order
//         });

//     } catch (err) {
//         console.error("adminCreateCommissionPayoutOrder:", err);
//         return res.status(500).json({ success: false, message: "Server error" });
//     }
// };

// export const verifyAffiliateCommissionPayment = async (req, res) => {
//     try {
//         const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

//         if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
//             return res.status(400).json({ success: false, message: "Invalid Razorpay payload" });
//         }

//         // -----------------------------
//         // 1️⃣ VERIFY SIGNATURE
//         // -----------------------------
//         const body = razorpay_order_id + "|" + razorpay_payment_id;

//         const expectedSignature = crypto
//             .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//             .update(body)
//             .digest("hex");

//         if (expectedSignature !== razorpay_signature) {
//             return res.status(400).json({ success: false, message: "Payment verification failed" });
//         }

//         // -----------------------------
//         // 2️⃣ FETCH ORDER DETAILS
//         // -----------------------------
//         const razorOrder = await razorpay.orders.fetch(razorpay_order_id);
//         const commissionAmount = razorOrder.amount / 100;
//         const notes = razorOrder.notes; // contains earningId + affiliateUserId

//         if (!notes?.earningId || !notes?.affiliateUserId) {
//             return res.status(400).json({ success: false, message: "Invalid order notes" });
//         }

//         const earningId = notes.earningId;
//         const affiliateUserId = notes.affiliateUserId;

//         // -----------------------------
//         // 3️⃣ VALIDATE EARNING
//         // -----------------------------
//         const earning = await AffiliateEarning.findById(earningId);
//         if (!earning) {
//             return res.status(404).json({ success: false, message: "Affiliate earning not found" });
//         }

//         if (earning.status === "paid") {
//             return res.status(200).json({
//                 success: true,
//                 message: "Earning already paid",
//                 earning
//             });
//         }

//         if (earning.status !== "approved") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Earning not approved yet"
//             });
//         }

//         // -----------------------------
//         // 4️⃣ MARK EARNING AS PAID
//         // -----------------------------
//         earning.status = "paid";
//         earning.paymentId = razorpay_payment_id;
//         earning.paidAt = new Date();
//         await earning.save();

//         // -----------------------------
//         // 5️⃣ CREATE PAYOUT RECORD (you already have AffiliatePayout)
//         // -----------------------------
//         const payout = await AffiliatePayout.create({
//             affiliateUser: affiliateUserId,
//             amount: commissionAmount,
//             method: "razorpay",
//             note: `Commission paid via Razorpay ${razorpay_payment_id}`,
//             earnings: [earningId]
//         });

//         // -----------------------------
//         // 6️⃣ SEND NOTIFICATION (optional)
//         // -----------------------------
//         try {
//             const user = await AffiliateUser.findById(affiliateUserId);
//             if (user?.email) {
//                 await sendEmail(
//                     user.email,
//                     "💸 Commission Payout Successful",
//                     `
//                         <h2>Hello ${user.fullName},</h2>
//                         <p>Your commission payout of <b>₹${commissionAmount}</b> has been processed.</p>
//                         <p><b>Payment ID:</b> ${razorpay_payment_id}</p>
//                         <p><b>Order ID:</b> ${earning.orderId}</p>
//                         <p><b>Date:</b> ${new Date().toDateString()}</p>
//                         <br/>
//                         <p>Keep earning with Joyory Affiliate Program 💰🔥</p>
//                     `
//                 );
//             }
//         } catch (emailErr) {
//             console.error("Payout email failed:", emailErr.message);
//         }

//         // -----------------------------
//         // 7️⃣ RETURN SUCCESS
//         // -----------------------------
//         return res.status(200).json({
//             success: true,
//             message: "Commission payout verified successfully",
//             earning,
//             payout
//         });

//     } catch (err) {
//         console.error("verifyAffiliateCommissionPayment error:", err);
//         return res.status(500).json({
//             success: false,
//             message: "Error verifying payout",
//             error: err.message
//         });
//     }
// };


// controllers/affiliateController.js
// (only the three controller functions below — keep your imports and razorpay instance)

export const adminApproveCommission = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { earningId } = req.body;
        if (!earningId) return res.status(400).json({ success: false, message: "earningId required" });

        let resultMessage = "Commission approved successfully";

        await session.withTransaction(async () => {
            // load earning inside transaction
            const earning = await AffiliateEarning.findById(earningId).session(session);
            if (!earning) throw { code: 404, message: "Earning not found" };

            if (earning.status !== "pending") {
                throw { code: 400, message: "Earning already processed or not pending" };
            }

            // Approve earning
            earning.status = "approved";
            await earning.save({ session });

            // Update affiliate user counters (walletBalance increases on approve)
            await AffiliateUser.findByIdAndUpdate(
                earning.affiliateUser,
                {
                    $inc: {
                        walletBalance: Number(earning.commission),
                        totalCommission: Number(earning.commission),
                        lifetimeEarnings: Number(earning.commission),
                        orders: 1,
                        sales: Number(earning.orderAmount)
                    }
                },
                { session }
            );

            // Update any affiliateOrder record (if exists)
            await AffiliateOrder.findOneAndUpdate(
                { orderId: earning.orderId },
                { status: "confirmed" },
                { session }
            ).catch(() => null);

            // Optionally you can emit events or logs here
        });

        session.endSession();
        return res.status(200).json({ success: true, message: resultMessage });

    } catch (err) {
        session.endSession();
        if (err && err.code) return res.status(err.code).json({ success: false, message: err.message });
        console.error("adminApproveCommission error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};


export const adminCreateCommissionPayoutOrder = async (req, res) => {
    try {
        const { earningId } = req.body;
        if (!earningId) return res.status(400).json({ success: false, message: "earningId required" });

        // fetch earning (read-only)
        const earning = await AffiliateEarning.findById(earningId);
        if (!earning) return res.status(404).json({ success: false, message: "Earning not found" });

        // must be approved
        if (earning.status !== "approved") {
            return res.status(400).json({ success: false, message: "Commission MUST be approved first." });
        }

        const shortEarningId = earningId.toString().slice(-6); // last 6 chars of ObjectId
        const random4 = Math.floor(1000 + Math.random() * 9000); // 4-digit code
        const receipt = `AFF${shortEarningId}${random4}`; // < 40 chars always

        // create razorpay order (amount in paise)
        const order = await razorpay.orders.create({
            amount: Math.round(Number(earning.commission) * 100),
            currency: "INR",
            receipt,
            notes: {
                earningId: earningId.toString(),
                affiliateUserId: earning.affiliateUser.toString()
            }
        });

        return res.status(200).json({
            success: true,
            message: "Razorpay order created",
            order
        });

    } catch (err) {
        console.error("adminCreateCommissionPayoutOrder:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};


export const verifyAffiliateCommissionPayment = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: "Invalid Razorpay payload" });
        }

        // 1) Verify signature
        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Payment verification failed (signature mismatch)" });
        }

        // 2) Fetch razorpay order (server-side)
        const razorOrder = await razorpay.orders.fetch(razorpay_order_id);
        if (!razorOrder) return res.status(400).json({ success: false, message: "Razorpay order not found" });

        const commissionAmount = Number(razorOrder.amount) / 100;
        const notes = razorOrder.notes || {};
        const earningId = notes.earningId;
        const affiliateUserId = notes.affiliateUserId;
        if (!earningId || !affiliateUserId) {
            return res.status(400).json({ success: false, message: "Invalid Razorpay notes" });
        }

        // 3) Transaction: check earning, check amounts, mark paid, create payout, decrement wallet
        let responsePayload = {};
        await session.withTransaction(async () => {
            const earning = await AffiliateEarning.findById(earningId).session(session);
            if (!earning) throw { code: 404, message: "Affiliate earning not found" };

            // Idempotency: if already paid, return gracefully (no double processing)
            if (earning.status === "paid") {
                responsePayload = { alreadyPaid: true, earning };
                return;
            }

            // ensure earning is approved before paying
            if (earning.status !== "approved") throw { code: 400, message: "Earning must be approved before payout" };

            // validate amounts — reject if mismatch (safety)
            const earningCommission = Number(earning.commission);
            if (Math.abs(earningCommission - commissionAmount) > 0.001) {
                // mismatch, abort
                throw {
                    code: 400,
                    message: `Amount mismatch: earning.commission=${earningCommission} but razorpay.amount=${commissionAmount}`
                };
            }

            // mark earning paid
            earning.status = "paid";
            earning.paymentId = razorpay_payment_id;
            earning.paidAt = new Date();
            await earning.save({ session });

            // create payout record (ties to earning)
            const payout = await AffiliatePayout.create([{
                affiliateUser: affiliateUserId,
                amount: commissionAmount,
                method: "razorpay",
                note: `Commission paid via Razorpay ${razorpay_payment_id}`,
                earnings: [earning._id]
            }], { session });

            // decrement user's walletBalance by paid amount (wallet represented unpaid commission)
            await AffiliateUser.findByIdAndUpdate(affiliateUserId, {
                $inc: { walletBalance: -commissionAmount }
            }, { session });

            // update affiliateOrder status to paid if you want
            await AffiliateOrder.findOneAndUpdate(
                { orderId: earning.orderId },
                { status: "paid" },
                { session }
            ).catch(() => null);

            responsePayload = { alreadyPaid: false, earning, payout: payout[0] };
        }); // end transaction

        session.endSession();

        // If alreadyPaid true, return 200 with message (idempotent)
        if (responsePayload.alreadyPaid) {
            return res.status(200).json({
                success: true,
                message: "Earning already processed as paid",
                earning: responsePayload.earning
            });
        }

        // -----------------------------
        // 7) SEND EMAIL (non-blocking, safe)
        // -----------------------------
        try {
            const user = await AffiliateUser.findById(responsePayload.earning.affiliateUser);

            if (user && user.email) {

                const safeFullName = user.fullName?.replace(/[<>]/g, "") || "Affiliate";
                const safePaymentId = razorpay_payment_id.replace(/[<>]/g, "");

                const emailHtml = `
            <div style="font-family:Arial, sans-serif; color:#333;">
                <h2 style="color:#2b2b2b;">Hello ${safeFullName},</h2>
                <p>Your affiliate commission payout has been successfully processed.</p>
                
                <p><b>Amount:</b> ₹${commissionAmount}</p>
                <p><b>Payment ID:</b> ${safePaymentId}</p>
                <p><b>Date:</b> ${new Date().toLocaleString()}</p>

                <br/>
                <p>Thank you for promoting Joyory! 🎉</p>
                <p>- Joyory Affiliate Team</p>
            </div>
        `;

                await sendEmail(
                    user.email,
                    "💸 Your Commission Payout is Successful!",
                    emailHtml
                );
            }

        } catch (emailErr) {
            console.error("❌ Email sending failed:", emailErr?.message || emailErr);
        }


        return res.status(200).json({
            success: true,
            message: "Commission payout verified successfully",
            earning: responsePayload.earning,
            payout: responsePayload.payout
        });

    } catch (err) {
        session.endSession();
        if (err && err.code) return res.status(err.code).json({ success: false, message: err.message });
        console.error("verifyAffiliateCommissionPayment error:", err);
        return res.status(500).json({ success: false, message: "Error verifying payout", error: err.message || err });
    }
};


export default {
    affiliateSignup,
    affiliateLogin,
    createAffiliateLink,
    getMyAffiliateLinks,
    trackClick,
    getAffiliateStats,
    getAffiliateOrders,
    getAffiliateEarnings,
    getAffiliatePayouts,

    // admin
    adminGetUsers,
    adminGetUserDetails,
    adminGetCommissions,
    adminApproveCommission,
    adminRejectCommission,
    adminPayAffiliate,
    adminGetPayoutHistory,
    adminAffiliateSummary,

};
