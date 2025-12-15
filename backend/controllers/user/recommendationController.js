import Product from "../../models/Product.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import mongoose from "mongoose";
import { formatProductCard, getRecommendations } from "../../middlewares/utils/recommendationService.js";
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";

// export const getHomepageSections = async (req, res) => {
//     try {
//         const isGuest = !req.user;
//         const sections = [];

//         // 🔹 Fetch trending, new arrivals, top selling, most viewed in a single query
//         const productsAgg = await Product.aggregate([
//             {
//                 $facet: {
//                     trending: [{ $sort: { sales: -1 } }, { $limit: 10 }],
//                     newArrivals: [{ $sort: { createdAt: -1 } }, { $limit: 10 }],
//                     topSelling: [{ $sort: { sales: -1 } }, { $limit: 10 }],
//                     mostViewed: [{ $sort: { views: -1 } }, { $limit: 10 }]
//                 }
//             }
//         ]);

//         const data = productsAgg[0] || {};

//         const trending = await Promise.all((data.trending || []).map(formatProductCard));
//         const newArrivals = await Promise.all((data.newArrivals || []).map(formatProductCard));
//         const topSelling = await Promise.all((data.topSelling || []).map(formatProductCard));
//         const mostViewed = await Promise.all((data.mostViewed || []).map(formatProductCard));

//         sections.push({ title: "Trending Now", products: trending });
//         sections.push({ title: "New Arrivals", products: newArrivals });
//         sections.push({ title: "Top Selling", products: topSelling });
//         sections.push({ title: "Most Viewed", products: mostViewed });

//         // 🔹 Personalized sections for logged-in users
//         if (!isGuest) {
//             const user = await User.findById(req.user._id).lean();
//             let purchasedIds = [];
//             let userCategories = [];
//             let userBrands = [];

//             const orders = await Order.find({ userId: req.user._id })
//                 .sort({ createdAt: -1 })
//                 .limit(20)
//                 .populate("products.productId")
//                 .lean();

//             orders.forEach(order => {
//                 order.products.forEach(item => {
//                     if (item.productId) {
//                         purchasedIds.push(item.productId._id.toString());
//                         if (item.productId.category) userCategories.push(item.productId.category.toString());
//                         if (item.productId.brand) userBrands.push(item.productId.brand);
//                     }
//                 });
//             });

//             user.recentProducts?.forEach(pid => purchasedIds.push(pid.toString()));
//             user.recentCategories?.forEach(cid => userCategories.push(cid.toString()));

//             const categoryScore = {};
//             userCategories.forEach(cid => categoryScore[cid] = (categoryScore[cid] || 0) + 3);
//             const brandScore = {};
//             userBrands.forEach(b => brandScore[b] = (brandScore[b] || 0) + 2);

//             const topCategories = Object.keys(categoryScore).sort((a, b) => categoryScore[b] - categoryScore[a]);
//             const topBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]);

//             const personalizedProducts = await Product.find({
//                 $or: [
//                     topCategories.length ? { category: { $in: topCategories } } : null,
//                     topBrands.length ? { brand: { $in: topBrands } } : null
//                 ].filter(Boolean),
//                 _id: { $nin: purchasedIds }
//             }).sort({ createdAt: -1 }).limit(10).lean();

//             const formattedPersonalized = await Promise.all(personalizedProducts.map(formatProductCard));
//             if (formattedPersonalized.length) sections.push({ title: "Recommended For You", products: formattedPersonalized });

//             const recentViewed = await getRecommendations({ mode: "recentlyViewed", userId: req.user._id, limit: 10 });
//             if (recentViewed.success && recentViewed.products.length) {
//                 sections.push({ title: "Recently Viewed", products: recentViewed.products });
//             }

//             if (formattedPersonalized.length) {
//                 const alsoViewed = await getRecommendations({ mode: "alsoViewed", productId: formattedPersonalized[0]._id, limit: 8 });
//                 if (alsoViewed.success && alsoViewed.products.length) {
//                     sections.push({ title: "Customers Also Viewed", products: alsoViewed.products });
//                 }
//             }
//         }

//         return res.json({ success: true, sections });
//     } catch (err) {
//         console.error("🔥 Homepage Sections Error:", err);
//         return res.status(500).json({ success: false, message: "Failed to fetch homepage sections" });
//     }
// };
export const getHomepageSections = async (req, res) => {
    try {
        const isGuest = !req.user;
        const sections = [];

        // 🔹 Fetch homepage buckets in ONE aggregation
        const productsAgg = await Product.aggregate([
            {
                $facet: {
                    trending: [{ $sort: { sales: -1 } }, { $limit: 10 }],
                    newArrivals: [{ $sort: { createdAt: -1 } }, { $limit: 10 }],
                    topSelling: [{ $sort: { sales: -1 } }, { $limit: 10 }],
                    mostViewed: [{ $sort: { views: -1 } }, { $limit: 10 }]
                }
            }
        ]);

        const data = productsAgg[0] || {};

        // 🔥 Unified enrichment (NO formatProductCard)
        const trending = await enrichProductsUnified(data.trending || []);
        const newArrivals = await enrichProductsUnified(data.newArrivals || []);
        const topSelling = await enrichProductsUnified(data.topSelling || []);
        const mostViewed = await enrichProductsUnified(data.mostViewed || []);

        sections.push({ title: "Trending Now", products: trending });
        sections.push({ title: "New Arrivals", products: newArrivals });
        sections.push({ title: "Top Selling", products: topSelling });
        sections.push({ title: "Most Viewed", products: mostViewed });

        // 🔹 Personalized sections (Logged-in users)
        if (!isGuest) {
            const user = await User.findById(req.user._id).lean();

            let purchasedIds = [];
            let userCategories = [];
            let userBrands = [];

            const orders = await Order.find({ userId: req.user._id })
                .sort({ createdAt: -1 })
                .limit(20)
                .populate("products.productId")
                .lean();

            orders.forEach(order => {
                order.products.forEach(item => {
                    if (!item.productId) return;
                    purchasedIds.push(item.productId._id.toString());
                    if (item.productId.category) userCategories.push(item.productId.category.toString());
                    if (item.productId.brand) userBrands.push(item.productId.brand);
                });
            });

            user?.recentProducts?.forEach(pid => purchasedIds.push(pid.toString()));
            user?.recentCategories?.forEach(cid => userCategories.push(cid.toString()));

            // 🔹 Weight scoring
            const categoryScore = {};
            userCategories.forEach(cid => categoryScore[cid] = (categoryScore[cid] || 0) + 3);

            const brandScore = {};
            userBrands.forEach(b => brandScore[b] = (brandScore[b] || 0) + 2);

            const topCategories = Object.keys(categoryScore).sort((a, b) => categoryScore[b] - categoryScore[a]);
            const topBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]);

            const personalizedProducts = await Product.find({
                $or: [
                    topCategories.length ? { category: { $in: topCategories } } : null,
                    topBrands.length ? { brand: { $in: topBrands } } : null
                ].filter(Boolean),
                _id: { $nin: purchasedIds }
            })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            const personalized = await enrichProductsUnified(personalizedProducts);
            if (personalized.length) {
                sections.push({ title: "Recommended For You", products: personalized });
            }

            // 🔹 Recently Viewed (already enriched)
            const recentViewed = await getRecommendations({
                mode: "recentlyViewed",
                userId: req.user._id,
                limit: 10
            });

            if (recentViewed?.success && recentViewed.products?.length) {
                sections.push({ title: "Recently Viewed", products: recentViewed.products });
            }

            // 🔹 Customers Also Viewed
            if (personalized.length) {
                const alsoViewed = await getRecommendations({
                    mode: "alsoViewed",
                    productId: personalized[0]._id,
                    limit: 8
                });

                if (alsoViewed?.success && alsoViewed.products?.length) {
                    sections.push({ title: "Customers Also Viewed", products: alsoViewed.products });
                }
            }
        }

        return res.json({ success: true, sections });

    } catch (err) {
        console.error("🔥 Homepage Sections Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch homepage sections"
        });
    }
};
