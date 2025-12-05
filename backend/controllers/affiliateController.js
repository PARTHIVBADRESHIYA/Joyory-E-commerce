import AffiliateUser from "../models/AffiliateUser.js";
import AffiliateLink from "../models/AffiliateLink.js";
import AffiliateEarning from "../models/AffiliateEarning.js";
import AffiliatePayout from "../models/AffiliatePayout.js";
import AffiliateOrder from "../models/AffiliateOrder.js";
import jwt from "jsonwebtoken";
import Product from "../models/Product.js";


// ------------------------------
// Generate JWT
// ------------------------------
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });
};


// ------------------------------
// 1. Affiliate Signup
// ------------------------------
export const affiliateSignup = async (req, res) => {
    try {
        const { fullName, email, password, mobile } = req.body;

        const exists = await AffiliateUser.findOne({ email });
        if (exists) {
            return res.status(400).json({ message: "Email already registered" });
        }

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

        return res.status(201).json({
            success: true,
            token: generateToken(user._id),
            user,
        });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ message: "Server error", err: err.message });
    }
};


// ------------------------------
// 2. Affiliate Login
// ------------------------------
export const affiliateLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await AffiliateUser.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "Affiliate not found" });
        }

        const matched = await user.comparePassword(password);
        if (!matched) {
            return res.status(400).json({ message: "Invalid password" });
        }

        return res.status(200).json({
            success: true,
            token: generateToken(user._id),
            user,
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


// ------------------------------
// 3. Create Affiliate Link
// ------------------------------
export const createAffiliateLink = async (req, res) => {
    try {
        const affiliateUser = req.affiliate;
        const { linkName, productId, externalUrl } = req.body;

        const slug = "AFF_" + Math.random().toString(36).substring(2, 8);

        let productSnapshot = {};

        if (productId) {
            const product = await Product.findById(productId).select("title price images");
            if (!product) {
                return res.status(404).json({ message: "Product not found" });
            }

            productSnapshot = {
                title: product.title,
                price: product.price,
                image: product.images?.[0] || null,
            };
        }

        // 🔥 This is the public affiliate link (tracking URL)
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

        return res.status(201).json({
            success: true,
            message: "Affiliate link created successfully.",
            link
        });

    } catch (err) {
        console.error("Create Link error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


// ------------------------------
// 4. Get All Links of this Affiliate
// ------------------------------
export const getMyAffiliateLinks = async (req, res) => {
    try {
        const affiliateUser = req.affiliate;

        const links = await AffiliateLink.find({ affiliateUser: affiliateUser._id })
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, links });

    } catch (err) {
        console.error("Fetch links error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


// ------------------------------
// 5. Track Clicks /aff/:slug
// ------------------------------
export const trackClick = async (req, res) => {
    try {
        const { slug } = req.params;

        const link = await AffiliateLink.findOne({ slug });
        if (!link) return res.status(404).json({ message: "Invalid affiliate link" });

        // Track click count
        link.clickCount += 1;
        await link.save();

        // Track clicks on affiliate user
        await AffiliateUser.findByIdAndUpdate(link.affiliateUser, {
            $inc: { clicks: 1 }
        });

        // Set affiliate cookie
        res.cookie("aff_slug", slug, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // 🔥 FINAL REDIRECTION LOGIC
        if (link.productId) {
            // Redirect to product page EXACTLY as you want
            return res.redirect(`${process.env.APP_URL}product/${link.productId}`);
        }

        if (link.externalUrl) {
            return res.redirect(link.externalUrl);
        }

        return res.redirect(process.env.APP_URL);

    } catch (err) {
        console.error("Click tracking error:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ------------------------------
// 6. Get Affiliate Dashboard Stats
// ------------------------------
export const getAffiliateStats = async (req, res) => {
    try {
        const user = req.affiliate;

        return res.status(200).json({
            success: true,
            clicks: user.clicks,
            orders: user.orders,
            sales: user.sales,
            totalCommission: user.totalCommission,
            bonus: user.orders * 180, // you can change bonus logic
        });

    } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


export const getAffiliateOrders = async (req, res) => {
    try {
        const orders = await AffiliateOrder.find({
            affiliateUser: req.affiliate._id
        })
            .populate("orderId", "orderNumber totalAmount status")
            .populate("affiliateLink", "slug linkName")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, orders });
    } catch (err) {
        console.error("Get affiliate orders error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


export const getPayouts = async (req, res) => {
    try {
        const paidOrders = await AffiliateOrder.find({
            affiliateUser: req.affiliate._id,
            status: "paid"
        }).sort({ createdAt: -1 });

        const totalPaid = paidOrders.reduce((sum, o) => sum + o.commission, 0);

        res.status(200).json({
            success: true,
            totalPaid,
            list: paidOrders
        });

    } catch (err) {
        console.error("Payout error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


export const markCommissionPaid = async (req, res) => {
    try {
        const { orderId } = req.body;

        const order = await AffiliateOrder.findById(orderId);
        if (!order) return res.status(404).json({ message: "Not found" });

        order.status = "paid";
        await order.save();

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Admin payout error:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ----------------------------------------------
// 1️⃣ Get all pending affiliate commissions
// ----------------------------------------------
export const getPendingCommissions = async (req, res) => {
    try {
        const list = await AffiliateEarning.find({ status: "pending" })
            .populate("affiliateUser", "fullName email mobile")
            .populate("affiliateLink", "slug linkName")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, list });

    } catch (err) {
        console.error("Admin fetch pending commissions error:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ----------------------------------------------
// 2️⃣ Approve a commission
// ----------------------------------------------
export const approveCommission = async (req, res) => {
    try {
        const { earningId } = req.body;

        const earning = await AffiliateEarning.findById(earningId);
        if (!earning) return res.status(404).json({ message: "Earning not found" });

        if (earning.status !== "pending") {
            return res.status(400).json({ message: "Earning already processed" });
        }

        earning.status = "approved";
        await earning.save();

        // update affiliate wallet
        await AffiliateUser.findByIdAndUpdate(earning.affiliateUser, {
            $inc: {
                walletBalance: earning.commission,
                totalCommission: earning.commission,
                lifetimeEarnings: earning.commission,
                orders: 1,
                sales: earning.orderAmount
            }
        });

        res.status(200).json({ success: true, message: "Commission approved" });

    } catch (err) {
        console.error("Admin approve commission error:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ----------------------------------------------
// 3️⃣ Reject a commission
// ----------------------------------------------
export const rejectCommission = async (req, res) => {
    try {
        const { earningId, note } = req.body;

        const earning = await AffiliateEarning.findById(earningId);
        if (!earning) return res.status(404).json({ message: "Earning not found" });

        if (earning.status !== "pending") {
            return res.status(400).json({ message: "Earning already processed" });
        }

        earning.status = "rejected";
        earning.note = note || "Rejected by admin";
        await earning.save();

        res.status(200).json({ success: true, message: "Commission rejected" });

    } catch (err) {
        console.error("Admin reject commission error:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ----------------------------------------------
// 4️⃣ Mark selected commissions as PAID
// ----------------------------------------------
export const payAffiliate = async (req, res) => {
    try {
        const { affiliateUserId, earningIds, amount, method, note } = req.body;

        const affiliate = await AffiliateUser.findById(affiliateUserId);
        if (!affiliate) return res.status(404).json({ message: "Affiliate not found" });

        // convert "string ids" to ObjectIds
        const earnings = await AffiliateEarning.find({
            _id: { $in: earningIds },
            status: "approved"
        });

        if (earnings.length === 0) {
            return res.status(400).json({ message: "No approved earnings selected" });
        }

        // mark each earning as paid
        await AffiliateEarning.updateMany(
            { _id: { $in: earningIds } },
            { $set: { status: "paid" } }
        );

        // create payout log
        const payout = await AffiliatePayout.create({
            affiliateUser: affiliateUserId,
            amount,
            method,
            note,
            earnings: earningIds
        });

        // reduce wallet balance
        await AffiliateUser.findByIdAndUpdate(affiliateUserId, {
            $inc: { walletBalance: -amount }
        });

        res.status(200).json({ success: true, payout });

    } catch (err) {
        console.error("Admin pay affiliate error:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ----------------------------------------------
// 5️⃣ Get Affiliate Payout History (Admin)
// ----------------------------------------------
export const getPayoutHistory = async (req, res) => {
    try {
        const list = await AffiliatePayout.find()
            .populate("affiliateUser", "fullName email")
            .populate("earnings", "orderNumber commission")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, list });

    } catch (err) {
        console.error("Admin payout history error:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ----------------------------------------------
// 6️⃣ Admin: Summary dashboard for affiliate module
// ----------------------------------------------
export const adminAffiliateSummary = async (req, res) => {
    try {
        const totalUsers = await AffiliateUser.countDocuments();
        const totalEarnings = await AffiliateEarning.aggregate([
            { $group: { _id: null, amount: { $sum: "$commission" } } }
        ]);

        const pending = await AffiliateEarning.countDocuments({ status: "pending" });
        const approved = await AffiliateEarning.countDocuments({ status: "approved" });
        const paid = await AffiliateEarning.countDocuments({ status: "paid" });

        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                totalEarnings: totalEarnings[0]?.amount || 0,
                pending,
                approved,
                paid
            }
        });

    } catch (err) {
        console.error("Admin affiliate summary error:", err);
        res.status(500).json({ message: "Server error" });
    }
};