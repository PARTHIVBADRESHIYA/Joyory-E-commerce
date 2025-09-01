// // controllers/recommendationController.js
// import Product from "../../models/Product.js";
// import User from "../../models/User.js";
// import Order from "../../models/Order.js";
// import Category from "../../models/Category.js";
// import mongoose from "mongoose";


// export const getPersonalizedRecommendations = async (req, res) => {
//     const userId = req.user.id;

//     try {
//         const user = await User.findById(userId).populate("savedRecommendations");
//         if (!user) return getDefaultRecommendations(req, res);

//         // ✅ STEP 0: Best sellers fallback
//         const bestSellers = await Product.find().sort({ totalSales: -1 }).limit(10);

//         // ✅ STEP 1: Orders (last 10 orders)
//         const orders = await Order.find({ user: userId })
//             .sort({ createdAt: -1 })
//             .limit(10)
//             .populate("products.productId");

//         let purchasedProductIds = [];
//         let purchasedCategories = [];
//         let purchasedBrands = [];

//         orders.forEach(order => {
//             order.products.forEach(item => {
//                 if (item.productId) {
//                     purchasedProductIds.push(item.productId._id);
//                     if (item.productId.category) purchasedCategories.push(item.productId.category);
//                     if (item.productId.brand) purchasedBrands.push(item.productId.brand);
//                 }
//             });
//         });

//         // ✅ STEP 2: Browsing history
//         const recentCategories = user.recentCategories || [];
//         const recentProducts = user.recentProducts || [];

//         let recentCategoryIds = [];
//         let recentBrands = [];

//         if (recentCategories.length) {
//             const categoryDocs = await Category.find({
//                 $or: [
//                     { _id: { $in: recentCategories.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
//                     { slug: { $in: recentCategories.map(c => c.toLowerCase()) } },
//                     { name: { $in: recentCategories } }
//                 ]
//             }).select("_id");

//             recentCategoryIds = categoryDocs.map(c => c._id);
//         }

//         if (recentProducts.length) {
//             const viewedProducts = await Product.find({ _id: { $in: recentProducts } })
//                 .select("category brand")
//                 .lean();

//             viewedProducts.forEach(p => {
//                 if (p.category) recentCategoryIds.push(p.category);
//                 if (p.brand) recentBrands.push(p.brand);
//             });
//         }

//         // ✅ STEP 3: Merge with WEIGHTING
//         // Browsing (higher weight) → Orders (lower weight)
//         const weightedCategories = [
//             ...recentCategoryIds.map(id => ({ id: String(id), weight: 3 })), // browsing weight = 3
//             ...purchasedCategories.map(id => ({ id: String(id), weight: 1 })) // orders weight = 1
//         ];

//         const weightedBrands = [
//             ...recentBrands.map(b => ({ id: b, weight: 2 })),  // browsing brands weight = 2
//             ...purchasedBrands.map(b => ({ id: b, weight: 1 }))
//         ];

//         // Aggregate weights
//         const categoryScore = {};
//         weightedCategories.forEach(({ id, weight }) => {
//             categoryScore[id] = (categoryScore[id] || 0) + weight;
//         });

//         const brandScore = {};
//         weightedBrands.forEach(({ id, weight }) => {
//             brandScore[id] = (brandScore[id] || 0) + weight;
//         });

//         // Sort by score (highest → lowest)
//         const combinedCategories = Object.keys(categoryScore).sort((a, b) => categoryScore[b] - categoryScore[a]);
//         const combinedBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]);

//         let recommendations = [];

//         // ✅ STEP 4: Recommend from top categories & brands
//         if (combinedCategories.length > 0 || combinedBrands.length > 0) {
//             recommendations = await Product.find({
//                 $or: [
//                     combinedCategories.length ? { category: { $in: combinedCategories } } : null,
//                     combinedBrands.length ? { brand: { $in: combinedBrands } } : null
//                 ].filter(Boolean),
//                 _id: { $nin: purchasedProductIds }
//             }).sort({ createdAt: -1 }) // newer products first
//               .limit(20);
//         }

//         // ✅ STEP 5: Parent categories
//         if (recommendations.length < 10 && combinedCategories.length > 0) {
//             const parentCats = await Category.find({ _id: { $in: combinedCategories } })
//                 .select("ancestors")
//                 .lean();

//             const ancestorIds = parentCats.flatMap(c => c.ancestors || []);
//             if (ancestorIds.length) {
//                 const parentRecs = await Product.find({
//                     category: { $in: ancestorIds },
//                     _id: { $nin: purchasedProductIds }
//                 }).limit(10);

//                 recommendations = [...recommendations, ...parentRecs];
//             }
//         }

//         // ✅ STEP 6: Sibling categories
//         if (recommendations.length < 10 && combinedCategories.length > 0) {
//             const parentCats = await Category.find({ _id: { $in: combinedCategories } })
//                 .select("ancestors")
//                 .lean();

//             const parentIds = parentCats.flatMap(c => c.ancestors || []);
//             if (parentIds.length) {
//                 const siblingCats = await Category.find({ ancestors: { $in: parentIds } })
//                     .select("_id")
//                     .lean();

//                 const siblingIds = siblingCats.map(c => c._id);
//                 if (siblingIds.length) {
//                     const siblingRecs = await Product.find({
//                         category: { $in: siblingIds },
//                         _id: { $nin: purchasedProductIds }
//                     }).limit(10);

//                     recommendations = [...recommendations, ...siblingRecs];
//                 }
//             }
//         }

//         // ✅ STEP 7: Fallback
//         if (!recommendations.length) {
//             recommendations = bestSellers.length
//                 ? bestSellers
//                 : await Product.aggregate([{ $sample: { size: 10 } }]);
//         }

//         // ✅ Deduplicate + final slice
//         const uniqueRecs = recommendations.filter(
//             (v, i, arr) => arr.findIndex(t => t._id.toString() === v._id.toString()) === i
//         ).slice(0, 15);

//         // ✅ Save cache
//         user.savedRecommendations = uniqueRecs.map(p => p._id);
//         user.lastRecommendationUpdate = new Date();
//         await user.save();

//         return res.json(uniqueRecs);
//     } catch (err) {
//         console.error("❌ Personalized Recommendations Error:", err);
//         return res.status(500).json({ error: "Failed to fetch personalized recommendations" });
//     }
// };

import Product from "../../models/Product.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import Category from "../../models/Category.js";
import mongoose from "mongoose";
import { formatProductCard, getRecommendations } from "../../middlewares/utils/recommendationService.js";

// 🔹 Default fallback
export const getDefaultRecommendations = async () => {
    const bestSellers = await Product.find().sort({ totalSales: -1 }).limit(10).lean();
    if (bestSellers.length) return Promise.all(bestSellers.map(formatProductCard));

    const random = await Product.aggregate([{ $sample: { size: 10 } }]);
    return Promise.all(random.map(formatProductCard));
};

export const getHomepageSections = async (req, res) => {
    try {
        const isGuest = !req.user;
        const sections = [];

        // 🔹 1️⃣ Trending
        const trending = await getRecommendations({ mode: "trending", limit: 10 });
        sections.push({ title: "Trending Now", products: trending.success ? trending.products : [] });

        // 🔹 2️⃣ New Arrivals
        const newArrivals = await Product.find({ inStock: true })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        const formattedNew = await Promise.all(newArrivals.map(formatProductCard));
        sections.push({ title: "New Arrivals", products: formattedNew });

        // 🔹 3️⃣ Top Selling (guest + user)
        const topSelling = await getRecommendations({ mode: "topSelling", categorySlug: "", limit: 10 });
        sections.push({ title: "Top Selling", products: topSelling.success ? topSelling.products : [] });

        // 🔹 4️⃣ Personalized & Recently Viewed for logged-in users
        if (!isGuest) {
            const user = await User.findById(req.user._id).lean();
            let purchasedIds = [];
            let userCategories = [];
            let userBrands = [];

            // Recent orders
            const orders = await Order.find({ userId: req.user._id })
                .sort({ createdAt: -1 })
                .limit(20)
                .populate("products.productId")
                .lean();

            orders.forEach(order => {
                order.products.forEach(item => {
                    if (item.productId) {
                        purchasedIds.push(item.productId._id.toString());
                        if (item.productId.category) userCategories.push(item.productId.category.toString());
                        if (item.productId.brand) userBrands.push(item.productId.brand);
                    }
                });
            });

            // Browsing history
            user.recentProducts?.forEach(pid => purchasedIds.push(pid.toString()));
            user.recentCategories?.forEach(cid => userCategories.push(cid.toString()));

            // Weighted scoring
            const categoryScore = {};
            userCategories.forEach(cid => categoryScore[cid] = (categoryScore[cid] || 0) + 3);
            const brandScore = {};
            userBrands.forEach(b => brandScore[b] = (brandScore[b] || 0) + 2);

            const topCategories = Object.keys(categoryScore).sort((a, b) => categoryScore[b] - categoryScore[a]);
            const topBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]);

            // Personalized
            let personalized = await Product.find({
                $or: [
                    topCategories.length ? { category: { $in: topCategories } } : null,
                    topBrands.length ? { brand: { $in: topBrands } } : null
                ].filter(Boolean),
                _id: { $nin: purchasedIds }
            }).sort({ createdAt: -1 }).limit(10).lean();

            const formattedPersonalized = await Promise.all(personalized.map(formatProductCard));
            if (formattedPersonalized.length) sections.push({ title: "Recommended For You", products: formattedPersonalized });

            // Recently Viewed
            const recentViewed = await getRecommendations({ mode: "recentlyViewed", userId: req.user._id, limit: 10 });
            if (recentViewed.success && recentViewed.products.length) {
                sections.push({ title: "Recently Viewed", products: recentViewed.products });
            }

            // Also Viewed (optional)
            if (personalized.length) {
                const alsoViewed = await getRecommendations({ mode: "alsoViewed", productId: personalized[0]._id, limit: 8 });
                if (alsoViewed.success && alsoViewed.products.length) {
                    sections.push({ title: "Customers Also Viewed", products: alsoViewed.products });
                }
            }
        }

        // 🔹 5️⃣ Fallback for guests or empty sections
        if (!sections.length || sections.every(s => !s.products.length)) {
            const defaultRec = await getDefaultRecommendations();
            sections.push({ title: "Recommended for You", products: defaultRec });
        }

        return res.json({ success: true, sections });
    } catch (err) {
        console.error("🔥 Homepage Sections Error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch homepage sections" });
    }
};






// export const getPersonalizedRecommendations = async (req, res) => {
//     try {
//         // ✅ Guest users → fallback
//         if (!req.user) return getDefaultRecommendations(req, res);

//         const userId = req.user.id;
//         const user = await User.findById(userId).populate("savedRecommendations");
//         if (!user) return getDefaultRecommendations(req, res);

//         // ✅ Best sellers as fallback pool
//         const bestSellers = await Product.find().sort({ totalSales: -1 }).limit(10);

//         // ✅ STEP 1: Fetch recent orders
//         const orders = await Order.find({ user: userId })
//             .sort({ createdAt: -1 })
//             .limit(10)
//             .populate("products.productId");

//         let purchasedProductIds = [];
//         let purchasedCategories = [];
//         let purchasedBrands = [];

//         orders.forEach(order => {
//             order.products.forEach(item => {
//                 if (item.productId) {
//                     purchasedProductIds.push(item.productId._id);
//                     if (item.productId.category) purchasedCategories.push(item.productId.category);
//                     if (item.productId.brand) purchasedBrands.push(item.productId.brand);
//                 }
//             });
//         });

//         // ✅ STEP 2: Browsing history
//         const recentCategories = user.recentCategories || [];
//         const recentProducts = user.recentProducts || [];

//         let recentCategoryIds = [];
//         let recentBrands = [];

//         if (recentCategories.length) {
//             const categoryDocs = await Category.find({
//                 $or: [
//                     { _id: { $in: recentCategories.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
//                     { slug: { $in: recentCategories.map(c => c.toLowerCase()) } },
//                     { name: { $in: recentCategories } }
//                 ]
//             }).select("_id");

//             recentCategoryIds = categoryDocs.map(c => c._id);
//         }

//         if (recentProducts.length) {
//             const viewedProducts = await Product.find({ _id: { $in: recentProducts } })
//                 .select("category brand")
//                 .lean();

//             viewedProducts.forEach(p => {
//                 if (p.category) recentCategoryIds.push(p.category);
//                 if (p.brand) recentBrands.push(p.brand);
//             });
//         }

//         // ✅ STEP 3: Weighted scoring
//         const weightedCategories = [
//             ...recentCategoryIds.map(id => ({ id: String(id), weight: 3 })), // browsing > orders
//             ...purchasedCategories.map(id => ({ id: String(id), weight: 1 }))
//         ];

//         const weightedBrands = [
//             ...recentBrands.map(b => ({ id: b, weight: 2 })),
//             ...purchasedBrands.map(b => ({ id: b, weight: 1 }))
//         ];

//         // Aggregate weights
//         const categoryScore = {};
//         weightedCategories.forEach(({ id, weight }) => {
//             categoryScore[id] = (categoryScore[id] || 0) + weight;
//         });

//         const brandScore = {};
//         weightedBrands.forEach(({ id, weight }) => {
//             brandScore[id] = (brandScore[id] || 0) + weight;
//         });

//         // Sort by highest score
//         const combinedCategories = Object.keys(categoryScore).sort((a, b) => categoryScore[b] - categoryScore[a]);
//         const combinedBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]);

//         let recommendations = [];

//         // ✅ STEP 4: Core recommendations (categories + brands)
//         if (combinedCategories.length > 0 || combinedBrands.length > 0) {
//             recommendations = await Product.find({
//                 $or: [
//                     combinedCategories.length ? { category: { $in: combinedCategories } } : null,
//                     combinedBrands.length ? { brand: { $in: combinedBrands } } : null
//                 ].filter(Boolean),
//                 _id: { $nin: purchasedProductIds }
//             })
//                 .sort({ createdAt: -1 }) // prioritize latest
//                 .limit(20);
//         }

//         // ✅ STEP 5: Parent categories (if less recs)
//         if (recommendations.length < 10 && combinedCategories.length > 0) {
//             const parentCats = await Category.find({ _id: { $in: combinedCategories } })
//                 .select("ancestors")
//                 .lean();

//             const ancestorIds = parentCats.flatMap(c => c.ancestors || []);
//             if (ancestorIds.length) {
//                 const parentRecs = await Product.find({
//                     category: { $in: ancestorIds },
//                     _id: { $nin: purchasedProductIds }
//                 }).limit(10);

//                 recommendations = [...recommendations, ...parentRecs];
//             }
//         }

//         // ✅ STEP 6: Sibling categories
//         if (recommendations.length < 10 && combinedCategories.length > 0) {
//             const parentCats = await Category.find({ _id: { $in: combinedCategories } })
//                 .select("ancestors")
//                 .lean();

//             const parentIds = parentCats.flatMap(c => c.ancestors || []);
//             if (parentIds.length) {
//                 const siblingCats = await Category.find({ ancestors: { $in: parentIds } })
//                     .select("_id")
//                     .lean();

//                 const siblingIds = siblingCats.map(c => c._id);
//                 if (siblingIds.length) {
//                     const siblingRecs = await Product.find({
//                         category: { $in: siblingIds },
//                         _id: { $nin: purchasedProductIds }
//                     }).limit(10);

//                     recommendations = [...recommendations, ...siblingRecs];
//                 }
//             }
//         }

//         // ✅ STEP 7: Absolute fallback
//         if (!recommendations.length) {
//             recommendations = bestSellers.length
//                 ? bestSellers
//                 : await Product.aggregate([{ $sample: { size: 10 } }]);
//         }

//         // ✅ Deduplicate + limit final
//         const uniqueRecs = recommendations.filter(
//             (v, i, arr) => arr.findIndex(t => t._id.toString() === v._id.toString()) === i
//         ).slice(0, 15);

//         // ✅ Cache for faster response next time
//         user.savedRecommendations = uniqueRecs.map(p => p._id);
//         user.lastRecommendationUpdate = new Date();
//         await user.save();

//         return res.json(uniqueRecs);
//     } catch (err) {
//         console.error("❌ Personalized Recommendations Error:", err);
//         return res.status(500).json({ error: "Failed to fetch personalized recommendations" });
//     }
// };











// export const getPersonalizedRecommendations = async (req, res) => {
//     try {
//         // ✅ Guest users → fallback
//         if (!req.user) return getDefaultRecommendations(req, res);

//         const userId = req.user.id;
//         const user = await User.findById(userId).populate("savedRecommendations");
//         if (!user) return getDefaultRecommendations(req, res);

//         // ✅ Best sellers as fallback pool
//         const bestSellers = await Product.find().sort({ totalSales: -1 }).limit(10);

//         // ✅ STEP 1: Fetch recent orders
//         const orders = await Order.find({ user: userId })
//             .sort({ createdAt: -1 })
//             .limit(10)
//             .populate("products.productId");

//         let purchasedProductIds = [];
//         let purchasedCategories = [];
//         let purchasedBrands = [];

//         orders.forEach(order => {
//             order.products.forEach(item => {
//                 if (item.productId) {
//                     purchasedProductIds.push(item.productId._id);
//                     if (item.productId.category) purchasedCategories.push(item.productId.category);
//                     if (item.productId.brand) purchasedBrands.push(item.productId.brand);
//                 }
//             });
//         });

//         // ✅ STEP 2: Browsing history
//         const recentCategories = user.recentCategories || [];
//         const recentProducts = user.recentProducts || [];

//         let recentCategoryIds = [];
//         let recentBrands = [];

//         if (recentCategories.length) {
//             // split into ObjectIds vs Strings
//             const objectIdCategories = recentCategories.filter(c => mongoose.Types.ObjectId.isValid(c));
//             const slugCategories = recentCategories
//                 .filter(c => typeof c === "string" && !mongoose.Types.ObjectId.isValid(c))
//                 .map(c => c.toLowerCase());

//             const categoryDocs = await Category.find({
//                 $or: [
//                     objectIdCategories.length ? { _id: { $in: objectIdCategories } } : null,
//                     slugCategories.length ? { slug: { $in: slugCategories } } : null,
//                     slugCategories.length ? { name: { $in: slugCategories } } : null
//                 ].filter(Boolean)
//             }).select("_id");

//             recentCategoryIds = categoryDocs.map(c => c._id);
//         }

//         if (recentProducts.length) {
//             const viewedProducts = await Product.find({ _id: { $in: recentProducts } })
//                 .select("category brand")
//                 .lean();

//             viewedProducts.forEach(p => {
//                 if (p.category) recentCategoryIds.push(p.category);
//                 if (p.brand) recentBrands.push(p.brand);
//             });
//         }

//         // ✅ STEP 3: Weighted scoring
//         const weightedCategories = [
//             ...recentCategoryIds.map(id => ({ id: String(id), weight: 3 })), // browsing > orders
//             ...purchasedCategories.map(id => ({ id: String(id), weight: 1 }))
//         ];

//         const weightedBrands = [
//             ...recentBrands.map(b => ({ id: b, weight: 2 })),
//             ...purchasedBrands.map(b => ({ id: b, weight: 1 }))
//         ];

//         // Aggregate weights
//         const categoryScore = {};
//         weightedCategories.forEach(({ id, weight }) => {
//             categoryScore[id] = (categoryScore[id] || 0) + weight;
//         });

//         const brandScore = {};
//         weightedBrands.forEach(({ id, weight }) => {
//             brandScore[id] = (brandScore[id] || 0) + weight;
//         });

//         // Sort by highest score
//         const combinedCategories = Object.keys(categoryScore).sort((a, b) => categoryScore[b] - categoryScore[a]);
//         const combinedBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]);

//         let recommendations = [];

//         // ✅ STEP 4: Core recommendations (categories + brands)
//         if (combinedCategories.length > 0 || combinedBrands.length > 0) {
//             recommendations = await Product.find({
//                 $or: [
//                     combinedCategories.length ? { category: { $in: combinedCategories } } : null,
//                     combinedBrands.length ? { brand: { $in: combinedBrands } } : null
//                 ].filter(Boolean),
//                 _id: { $nin: purchasedProductIds }
//             })
//                 .sort({ createdAt: -1 })
//                 .limit(20);
//         }

//         // ✅ STEP 5: Parent categories (if less recs)
//         if (recommendations.length < 10 && combinedCategories.length > 0) {
//             const parentCats = await Category.find({ _id: { $in: combinedCategories } })
//                 .select("ancestors")
//                 .lean();

//             const ancestorIds = parentCats.flatMap(c => c.ancestors || []);
//             if (ancestorIds.length) {
//                 const parentRecs = await Product.find({
//                     category: { $in: ancestorIds },
//                     _id: { $nin: purchasedProductIds }
//                 }).limit(10);

//                 recommendations = [...recommendations, ...parentRecs];
//             }
//         }

//         // ✅ STEP 6: Sibling categories
//         if (recommendations.length < 10 && combinedCategories.length > 0) {
//             const parentCats = await Category.find({ _id: { $in: combinedCategories } })
//                 .select("ancestors")
//                 .lean();

//             const parentIds = parentCats.flatMap(c => c.ancestors || []);
//             if (parentIds.length) {
//                 const siblingCats = await Category.find({ ancestors: { $in: parentIds } })
//                     .select("_id")
//                     .lean();

//                 const siblingIds = siblingCats.map(c => c._id);
//                 if (siblingIds.length) {
//                     const siblingRecs = await Product.find({
//                         category: { $in: siblingIds },
//                         _id: { $nin: purchasedProductIds }
//                     }).limit(10);

//                     recommendations = [...recommendations, ...siblingRecs];
//                 }
//             }
//         }

//         // ✅ STEP 7: Absolute fallback
//         if (!recommendations.length) {
//             recommendations = bestSellers.length
//                 ? bestSellers
//                 : await Product.aggregate([{ $sample: { size: 10 } }]);
//         }

//         // ✅ Deduplicate + limit final
//         const uniqueRecs = recommendations.filter(
//             (v, i, arr) => arr.findIndex(t => t._id.toString() === v._id.toString()) === i
//         ).slice(0, 15);

//         // ✅ Cache for faster response next time
//         user.savedRecommendations = uniqueRecs.map(p => p._id);
//         user.lastRecommendationUpdate = new Date();
//         await user.save();

//         return res.json(uniqueRecs);
//     } catch (err) {
//         console.error("❌ Personalized Recommendations Error:", err);
//         return res.status(500).json({ error: "Failed to fetch personalized recommendations" });
//     }
// };
