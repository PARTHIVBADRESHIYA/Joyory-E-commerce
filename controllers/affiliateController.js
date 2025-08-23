import Affiliate from '../models/Affiliate.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import moment from 'moment';

const generateReferralCode = () => 'AFF' + Math.random().toString(36).substring(2, 8).toUpperCase();

export const applyAsAffiliate = async (req, res) => {
    const existing = await Affiliate.findOne({ user: req.user._id });
    if (existing) return res.status(400).json({ msg: 'Already applied' });

    const newAffiliate = await Affiliate.create({
        user: req.user._id,
        referralCode: generateReferralCode()
    });

    res.status(201).json({ msg: 'Applied successfully', affiliate: newAffiliate });
};

export const generateLink = async (req, res) => {
    const { productId, customUrl } = req.body;
    const affiliate = await Affiliate.findOne({ user: req.user._id });
    if (!affiliate || affiliate.status !== 'approved') return res.status(403).json({ msg: 'Not approved' });

    let link;
    if (productId) {
        link = `https://yourstore.com/product/${productId}?ref=${affiliate.referralCode}`;
    } else if (customUrl) {
        link = `${customUrl}?ref=${affiliate.referralCode}`;
    } else {
        return res.status(400).json({ msg: 'Provide productId or customUrl' });
    }

    affiliate.generatedLinks.push({
        product: productId || null,
        shortLink: link,
        viaUrl: !productId,
        customUrl: customUrl || null
    });

    await affiliate.save();
    res.json({ link });
};

export const trackReferralClick = async (req, res) => {
    try {
        const { ref } = req.query;
        const { productId } = req.params;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ msg: 'Product not found' });

        product.views = (product.views || 0) + 1;
        product.affiliateClicks = (product.affiliateClicks || 0) + 1;
        await product.save();

        if (ref) {
            const affiliate = await Affiliate.findOne({ referralCode: ref });
            if (affiliate) {
                const link = affiliate.generatedLinks.find(l => l.product?.toString() === productId);
                if (link) link.clicks += 1;

                affiliate.totalClicks += 1;
                await affiliate.save();
            }
        }

        res.status(200).json({
            message: '✅ Product click tracked',
            redirectTo: `/product/${productId}`,
            views: product.views,
            affiliateClicks: product.affiliateClicks
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
export const trackCustomReferralClick = async (req, res) => {
    try {
        const { ref, custom } = req.query;

        if (!ref || !custom) {
            return res.status(400).json({ msg: '❌ Missing ref or custom URL' });
        }

        // Normalize custom URL (trim trailing slash, lowercase, etc.)
        const normalizedCustom = decodeURIComponent(custom).trim().toLowerCase().replace(/\/+$/, '');

        const affiliate = await Affiliate.findOne({ referralCode: ref });
        if (!affiliate) {
            return res.status(404).json({ msg: '❌ Affiliate not found' });
        }

        // Normalize all stored links and match
        const link = affiliate.generatedLinks.find(l =>
            l.viaUrl &&
            l.customUrl &&
            l.customUrl.trim().toLowerCase().replace(/\/+$/, '') === normalizedCustom
        );

        if (!link) {
            return res.status(404).json({
                msg: '❌ Custom link not found for this affiliate',
                debug: {
                    provided: normalizedCustom,
                    stored: affiliate.generatedLinks.map(l => l.customUrl)
                }
            });
        }

        link.clicks += 1;
        affiliate.totalClicks += 1;
        await affiliate.save();

        res.status(200).json({
            message: '✅ Custom link click tracked',
            redirectTo: custom,
            clicks: link.clicks,
            totalClicks: affiliate.totalClicks
        });
    } catch (err) {
        console.error('🔥 Error in custom referral tracking:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};







export const getAllAffiliates = async (req, res) => {
    const affiliates = await Affiliate.find().populate('user');
    res.json(affiliates);
};

export const updateAffiliateStatus = async (req, res) => {
    const updated = await Affiliate.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
};

export const getPopularProducts = async (req, res) => {
    try {
        const affiliates = await Affiliate.find().populate('generatedLinks.product');
        const earningsMap = {};

        affiliates.forEach(affiliate => {
            const rate = affiliate.commissionRate || 0.15;

            affiliate.generatedLinks.forEach(link => {
                const productId = link.product?._id?.toString();
                if (!productId || affiliate.exclusions.includes(productId)) return;

                const clicks = link.clicks || 0;
                const price = link.product.price || 0;
                const earning = rate * price * clicks * 0.10;

                if (!earningsMap[productId]) {
                    earningsMap[productId] = {
                        product: link.product,
                        totalEarning: 0
                    };
                }
                earningsMap[productId].totalEarning += earning;
            });
        });


        const popularProducts = Object.values(earningsMap).sort((a, b) => b.totalEarning - a.totalEarning);

        res.json(popularProducts.map(p => ({
            name: p.product.name,
            subtitle: p.product.subtitle || p.product.variant,
            image: p.product.image,
            price: p.product.price,
            totalEarning: p.totalEarning.toFixed(2),
            status: p.product.status || 'Active'
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getProductActivity = async (req, res) => {
    try {
        const allProducts = await Product.find();

        const activityData = await Promise.all(
            allProducts.map(async p => {
                const currentViews = p.views || 0;
                const previousViews = p.lastWeekViews || 0;

                const currentClicks = p.clicks || 0;
                const previousClicks = p.lastWeekClicks || 0;

                const currentComments = await Review.countDocuments({ productId: p._id });
                const previousComments = p.lastWeekComments || 0;

                const viewsChange = ((currentViews - previousViews) / (previousViews || 1)) * 100;
                const clicksChange = ((currentClicks - previousClicks) / (previousClicks || 1)) * 100;
                const commentsChange = ((currentComments - previousComments) / (previousComments || 1)) * 100;

                return {
                    _id: p._id,
                    name: p.name,
                    image: p.image || null,
                    status: p.status || 'Inactive',
                    views: currentViews,
                    clicks: currentClicks,
                    comments: currentComments,
                    viewsChange: viewsChange.toFixed(1),
                    clicksChange: clicksChange.toFixed(1),
                    commentsChange: commentsChange.toFixed(1),
                };
            })
        );

        res.status(200).json(activityData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
