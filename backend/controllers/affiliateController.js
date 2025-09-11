// import Affiliate from '../models/Affiliate.js';
// import Product from '../models/Product.js';
// import Review from '../models/Review.js';
// import moment from 'moment';

// const generateReferralCode = () => 'AFF' + Math.random().toString(36).substring(2, 8).toUpperCase();

// export const applyAsAffiliate = async (req, res) => {
//     const existing = await Affiliate.findOne({ user: req.user._id });
//     if (existing) return res.status(400).json({ msg: 'Already applied' });

//     const newAffiliate = await Affiliate.create({
//         user: req.user._id,
//         referralCode: generateReferralCode()
//     });

//     res.status(201).json({ msg: 'Applied successfully', affiliate: newAffiliate });
// };

// export const generateLink = async (req, res) => {
//     const { productId, customUrl } = req.body;
//     const affiliate = await Affiliate.findOne({ user: req.user._id });
//     if (!affiliate || affiliate.status !== 'approved') return res.status(403).json({ msg: 'Not approved' });

//     let link;
//     if (productId) {
//         link = `https://yourstore.com/product/${productId}?ref=${affiliate.referralCode}`;
//     } else if (customUrl) {
//         link = `${customUrl}?ref=${affiliate.referralCode}`;
//     } else {
//         return res.status(400).json({ msg: 'Provide productId or customUrl' });
//     }

//     affiliate.generatedLinks.push({
//         product: productId || null,
//         shortLink: link,
//         viaUrl: !productId,
//         customUrl: customUrl || null
//     });

//     await affiliate.save();
//     res.json({ link });
// };

// export const trackReferralClick = async (req, res) => {
//     try {
//         const { ref } = req.query;
//         const { productId } = req.params;

//         const product = await Product.findById(productId);
//         if (!product) return res.status(404).json({ msg: 'Product not found' });

//         product.views = (product.views || 0) + 1;
//         product.affiliateClicks = (product.affiliateClicks || 0) + 1;
//         await product.save();

//         if (ref) {
//             const affiliate = await Affiliate.findOne({ referralCode: ref });
//             if (affiliate) {
//                 const link = affiliate.generatedLinks.find(l => l.product?.toString() === productId);
//                 if (link) link.clicks += 1;

//                 affiliate.totalClicks += 1;
//                 await affiliate.save();
//             }
//         }

//         res.status(200).json({
//             message: '✅ Product click tracked',
//             redirectTo: `/product/${productId}`,
//             views: product.views,
//             affiliateClicks: product.affiliateClicks
//         });
//     } catch (err) {
//         res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };
// export const trackCustomReferralClick = async (req, res) => {
//     try {
//         const { ref, custom } = req.query;

//         if (!ref || !custom) {
//             return res.status(400).json({ msg: '❌ Missing ref or custom URL' });
//         }

//         // Normalize custom URL (trim trailing slash, lowercase, etc.)
//         const normalizedCustom = decodeURIComponent(custom).trim().toLowerCase().replace(/\/+$/, '');

//         const affiliate = await Affiliate.findOne({ referralCode: ref });
//         if (!affiliate) {
//             return res.status(404).json({ msg: '❌ Affiliate not found' });
//         }

//         // Normalize all stored links and match
//         const link = affiliate.generatedLinks.find(l =>
//             l.viaUrl &&
//             l.customUrl &&
//             l.customUrl.trim().toLowerCase().replace(/\/+$/, '') === normalizedCustom
//         );

//         if (!link) {
//             return res.status(404).json({
//                 msg: '❌ Custom link not found for this affiliate',
//                 debug: {
//                     provided: normalizedCustom,
//                     stored: affiliate.generatedLinks.map(l => l.customUrl)
//                 }
//             });
//         }

//         link.clicks += 1;
//         affiliate.totalClicks += 1;
//         await affiliate.save();

//         res.status(200).json({
//             message: '✅ Custom link click tracked',
//             redirectTo: custom,
//             clicks: link.clicks,
//             totalClicks: affiliate.totalClicks
//         });
//     } catch (err) {
//         console.error('🔥 Error in custom referral tracking:', err);
//         res.status(500).json({ msg: 'Server error', error: err.message });
//     }
// };







// export const getAllAffiliates = async (req, res) => {
//     const affiliates = await Affiliate.find().populate('user');
//     res.json(affiliates);
// };

// export const updateAffiliateStatus = async (req, res) => {
//     const updated = await Affiliate.findByIdAndUpdate(req.params.id, req.body, { new: true });
//     res.json(updated);
// };

// export const getPopularProducts = async (req, res) => {
//     try {
//         const affiliates = await Affiliate.find().populate('generatedLinks.product');
//         const earningsMap = {};

//         affiliates.forEach(affiliate => {
//             const rate = affiliate.commissionRate || 0.15;

//             affiliate.generatedLinks.forEach(link => {
//                 const productId = link.product?._id?.toString();
//                 if (!productId || affiliate.exclusions.includes(productId)) return;

//                 const clicks = link.clicks || 0;
//                 const price = link.product.price || 0;
//                 const earning = rate * price * clicks * 0.10;

//                 if (!earningsMap[productId]) {
//                     earningsMap[productId] = {
//                         product: link.product,
//                         totalEarning: 0
//                     };
//                 }
//                 earningsMap[productId].totalEarning += earning;
//             });
//         });


//         const popularProducts = Object.values(earningsMap).sort((a, b) => b.totalEarning - a.totalEarning);

//         res.json(popularProducts.map(p => ({
//             name: p.product.name,
//             subtitle: p.product.subtitle || p.product.variant,
//             image: p.product.image,
//             price: p.product.price,
//             totalEarning: p.totalEarning.toFixed(2),
//             status: p.product.status || 'Active'
//         })));
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };

// export const getProductActivity = async (req, res) => {
//     try {
//         const allProducts = await Product.find();

//         const activityData = await Promise.all(
//             allProducts.map(async p => {
//                 const currentViews = p.views || 0;
//                 const previousViews = p.lastWeekViews || 0;

//                 const currentClicks = p.clicks || 0;
//                 const previousClicks = p.lastWeekClicks || 0;

//                 const currentComments = await Review.countDocuments({ productId: p._id });
//                 const previousComments = p.lastWeekComments || 0;

//                 const viewsChange = ((currentViews - previousViews) / (previousViews || 1)) * 100;
//                 const clicksChange = ((currentClicks - previousClicks) / (previousClicks || 1)) * 100;
//                 const commentsChange = ((currentComments - previousComments) / (previousComments || 1)) * 100;

//                 return {
//                     _id: p._id,
//                     name: p.name,
//                     image: p.image || null,
//                     status: p.status || 'Inactive',
//                     views: currentViews,
//                     clicks: currentClicks,
//                     comments: currentComments,
//                     viewsChange: viewsChange.toFixed(1),
//                     clicksChange: clicksChange.toFixed(1),
//                     commentsChange: commentsChange.toFixed(1),
//                 };
//             })
//         );

//         res.status(200).json(activityData);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };

















import Affiliate from '../models/Affiliate.js';
import AffiliateClick from '../models/AffiliateClick.js';
import AffiliateTransaction from '../models/AffiliateTransaction.js';
import Product from '../models/Product.js';
import { generateShort } from '../middlewares/utils/generateShortCode.js';
import { normalizeUrl } from '../middlewares/utils/normalizeUrl.js';
import mongoose from 'mongoose';
import { nanoid } from "nanoid";


// 1) user applies to become an affiliate
export const applyAsAffiliate = async (req, res) => {
    const { fullName, phone, bio, socials } = req.body;
    try {
        const existing = await Affiliate.findOne({ user: req.user._id });
        if (existing) return res.status(400).json({ msg: 'You already applied or are an affiliate' });


        const aff = await Affiliate.create({
            user: req.user._id,
            application: { fullName, phone, bio, socials },
            status: 'pending'
        });


        // notify admin (email / dashboard) - implement separately
        return res.status(201).json({ msg: 'Application submitted', affiliate: aff });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error', error: err.message });
    }
}


// 2) admin approves and sets commission
export const updateAffiliateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body; // { status: 'approved', commissionRate: 0.12 }
        const updated = await Affiliate.findByIdAndUpdate(id, payload, { new: true });
        return res.json(updated);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}


// // 3) affiliate generates a short link for product or custom URL
// export const generateLink = async (req, res) => {
//     try {
//         const { productId, customUrl, expiresAt } = req.body;
//         const affiliate = await Affiliate.findOne({ user: req.user._id });
//         if (!affiliate || affiliate.status !== 'approved') return res.status(403).json({ msg: 'Affiliate not approved' });


//         const shortCode = generateShort(7);
//         let destination;
//         let viaUrl = false;
//         let linkedProduct = null;


//         if (productId) {
//             const p = await Product.findById(productId);
//             if (!p) return res.status(404).json({ msg: 'Product not found' });
//             destination = `${process.env.FRONTEND_URL}/product/${productId}?ref=${affiliate.referralCode}`;
//             linkedProduct = p._id;
//         } else if (customUrl) {
//             destination = customUrl;
//             viaUrl = true;
//         } else {
//             return res.status(400).json({ msg: 'Provide productId or customUrl' });
//         }


//         affiliate.generatedLinks.push({
//             product: linkedProduct,
//             shortCode,
//             destination,
//             viaUrl,
//             customUrl: customUrl ? normalizeUrl(customUrl) : null,
//             expiresAt: expiresAt ? new Date(expiresAt) : null
//         });


//         await affiliate.save();


//         const shortLink = `${process.env.SHORTLINK_BASE}/r/${shortCode}`;
//         return res.json({ shortLink, shortCode });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ msg: 'Server error', error: err.message });
//     }
// }

// // 4) public redirect endpoint - /r/:shortCode
// export const redirectShortLink = async (req, res) => {
//     try {
//         const { shortCode } = req.params;


//         // find affiliate and link
//         const affiliate = await Affiliate.findOne({ 'generatedLinks.shortCode': shortCode });
//         if (!affiliate) return res.status(404).send('Not found');


//         const link = affiliate.generatedLinks.find(l => l.shortCode === shortCode);
//         if (!link) return res.status(404).send('Not found');


//         // handle expiration
//         if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).send('Link expired');


//         // dedupe: optional - check recent click from same IP & link (use Redis in production). Keep basic storage here.


//         // store click
//         affiliate.totalClicks = (affiliate.totalClicks || 0) + 1;
//         link.clicks = (link.clicks || 0) + 1;
//         await affiliate.save();


//         await AffiliateClick.create({
//             affiliate: affiliate._id,
//             affiliateLinkShortCode: shortCode,
//             product: link.product || null,
//             ip: req.ip,
//             userAgent: req.get('User-Agent'),
//             referer: req.get('Referer') || ''
//         });


//         // Redirect to destination. If destination is our internal short product link (like /p/:productId...), redirect to that route
//         return res.redirect(link.destination);
//     } catch (err) {
//         console.error(err);
//         return res.status(500).send('Server error');
//     }
// }



// 1) Generate affiliate link (product or custom URL)
export const generateLink = async (req, res) => {
    try {
        const { productId, customUrl, expiresAt } = req.body;

        // find affiliate for logged-in user
        const affiliate = await Affiliate.findOne({ user: req.user._id });
        if (!affiliate || affiliate.status !== "approved") {
            return res.status(403).json({ msg: "Affiliate not approved" });
        }

        const shortCode = generateShort(7);
        let destination;
        let viaUrl = false;
        let linkedProduct = null;

        if (productId) {
            const p = await Product.findById(productId);
            if (!p) return res.status(404).json({ msg: "Product not found" });

            // redirect to frontend product page with referral code
            destination = `${process.env.FRONTEND_URL}/product/${productId}?ref=${affiliate.referralCode}`;
            linkedProduct = p._id;
        } else if (customUrl) {
            destination = normalizeUrl(customUrl);
            viaUrl = true;
        } else {
            return res.status(400).json({ msg: "Provide productId or customUrl" });
        }

        // save generated link to affiliate
        affiliate.generatedLinks.push({
            product: linkedProduct,
            shortCode,
            destination,
            viaUrl,
            customUrl: customUrl ? normalizeUrl(customUrl) : null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
        });

        await affiliate.save();

        const shortLink = `${process.env.SHORTLINK_BASE}/r/${shortCode}`;
        return res.json({ shortLink, shortCode });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Server error", error: err.message });
    }
};

// 2) Public redirect endpoint - /r/:shortCode
export const redirectShortLink = async (req, res) => {
    try {
        const { shortCode } = req.params;

        // find affiliate and link
        const affiliate = await Affiliate.findOne({ "generatedLinks.shortCode": shortCode });
        if (!affiliate) return res.status(404).send("Not found");

        const link = affiliate.generatedLinks.find((l) => l.shortCode === shortCode);
        if (!link) return res.status(404).send("Not found");

        // handle expiration
        if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).send("Link expired");

        // track clicks
        affiliate.totalClicks = (affiliate.totalClicks || 0) + 1;
        link.clicks = (link.clicks || 0) + 1;
        await affiliate.save();

        await AffiliateClick.create({
            affiliate: affiliate._id,
            affiliateLinkShortCode: shortCode,
            product: link.product || null,
            ip: req.ip,
            userAgent: req.get("User-Agent"),
            referer: req.get("Referer") || "",
        });

        // redirect to frontend (product page or custom URL)
        return res.redirect(link.destination);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Server error");
    }
};

// 5) Track product click when direct product link is clicked (older pattern)
export const trackProductClick = async (req, res) => {
    try {
        const { ref } = req.query; // referral code
        const { productId } = req.params;


        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ msg: 'Product not found' });


        product.views = (product.views || 0) + 1;
        product.affiliateClicks = (product.affiliateClicks || 0) + 1;
        await product.save();


        if (ref) {
            const affiliate = await Affiliate.findOne({ referralCode: ref });
            if (affiliate) {
                // find matching generated link for product (if any)
                const link = affiliate.generatedLinks.find(l => l.product?.toString() === productId);
                if (link) link.clicks += 1;
                affiliate.totalClicks += 1;
                await affiliate.save();


                await AffiliateClick.create({
                    affiliate: affiliate._id,
                    affiliateLinkShortCode: link?.shortCode || null,
                    product: product._id,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    referer: req.get('Referer') || ''
                });
            }
        }


        return res.status(200).json({ message: 'Tracked', redirectTo: `/product/${productId}` });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error', error: err.message });
    }
}

// ✅ Handle order completed webhook or internal order saved event
export const handleAffiliateOrder = async (order) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const affiliate = await Affiliate.findOne({ referralCode: order.referralCode }).session(session);
        if (!affiliate) {
            await session.commitTransaction();
            return { processed: false, reason: 'no_affiliate' };
        }

        // Prevent self-referrals
        if (affiliate.user.toString() === order.user?.toString()) {
            await session.commitTransaction();
            return { processed: false, reason: 'self_referral' };
        }

        // Calculate commission
        let totalCommission = 0;
        for (const item of order.items) {
            // Skip excluded products
            if (affiliate.exclusions?.some(e => e.toString() === item.product.toString())) continue;

            const product = await Product.findById(item.product).session(session);
            if (!product) continue;

            const price = item.price * (item.qty || 1);

            // Product-level override or fallback to affiliate rate or default
            const rate = (product.affiliateCommission ??
                affiliate.commissionRate ??
                parseFloat(process.env.DEFAULT_AFFILIATE_COMMISSION || 0.10));

            const commission = price * rate;
            totalCommission += commission;
        }

        if (totalCommission <= 0) {
            await session.commitTransaction();
            return { processed: false, reason: 'no_commission' };
        }

        // Create AffiliateTransaction (idempotent by unique index affiliate+orderId)
        await AffiliateTransaction.create([{
            affiliate: affiliate._id,
            orderId: order._id,
            orderAmount: order.totalAmount,
            commissionAmount: totalCommission,
            status: 'pending'
        }], { session });

        // Update affiliate stats
        affiliate.totalEarnings = (affiliate.totalEarnings || 0) + totalCommission;
        affiliate.payoutBalance = (affiliate.payoutBalance || 0) + totalCommission;
        affiliate.successfulOrders = (affiliate.successfulOrders || 0) + 1;

        await affiliate.save({ session });

        await session.commitTransaction();
        return { processed: true, commission: totalCommission };
    } catch (err) {
        await session.abortTransaction();
        console.error('Error creating affiliate tx', err);
        throw err;
    } finally {
        session.endSession();
    }
};



// 7) Reversal on refund/cancel
export const handleOrderRefund = async (order) => {
    // mark AffiliateTransaction as reversed and adjust affiliate totals
    const tx = await AffiliateTransaction.findOne({ orderId: order._id });
    if (!tx || tx.status === 'reversed') return { reversed: false };


    const affiliate = await Affiliate.findById(tx.affiliate);
    if (!affiliate) return { reversed: false };


    tx.status = 'reversed';
    await tx.save();


    affiliate.totalEarnings = Math.max(0, (affiliate.totalEarnings || 0) - tx.commissionAmount);
    affiliate.payoutBalance = Math.max(0, (affiliate.payoutBalance || 0) - tx.commissionAmount);
    affiliate.successfulOrders = Math.max(0, (affiliate.successfulOrders || 1) - 1);


    await affiliate.save();
    return { reversed: true };
}


// 8) Admin: get affiliates with basic analytics
export const getAllAffiliates = async (req, res) => {
    const affiliates = await Affiliate.find().populate('user', 'name email').lean();
    return res.json(affiliates);
}


// 9) Admin: export CSV (example)
export const exportAffiliatesCSV = async (req, res) => {
    const affiliates = await Affiliate.find().populate('user', 'name email');
    // create CSV from affiliates array (left as exercise) - or stream
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=affiliates.csv');
    // build rows
    const rows = ['referralCode,name,email,status,totalEarnings,payoutBalance'];
    affiliates.forEach(a => rows.push(`${a.referralCode},${a.user?.name || ''},${a.user?.email || ''},${a.status},${a.totalEarnings},${a.payoutBalance}`));
    res.send(rows.join('\n'));
}