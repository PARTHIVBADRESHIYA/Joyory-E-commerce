import User from "../../../models/User.js";
import Product from "../../../models/Product.js";
import mongoose from "mongoose";
import { getRedis } from "../../../middlewares/utils/redis.js";
import { enrichProductsUnified } from "../../../middlewares/services/productHelpers.js";
import Promotion
    from "../../../models/Promotion.js";

import {invalidateCartCache} from "../../../controllers/user/userCartController.js";


// export const addToWishlist = async (req, res) => {
//     try {
//         const { productId } = req.params;
//         const userId = req.user._id;

//         if (!mongoose.Types.ObjectId.isValid(productId)) {
//             return res.status(400).json({ message: "Invalid product ID" });
//         }

//         const product = await Product.findById(productId).select("name");
//         if (!product) {
//             return res.status(404).json({ message: "Product not found" });
//         }

//         await User.findByIdAndUpdate(
//             userId,
//             {
//                 $addToSet: {
//                     wishlist: {
//                         productId,
//                         name: product.name   // 🔥 STORE SNAPSHOT
//                     }
//                 }
//             }
//         );

//         res.status(200).json({
//             success: true,
//             message: "Added to wishlist"
//         });

//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
export const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        const { sku } = req.body;
        const userId = req.user._id;

        // ───────────────── VALIDATIONS ─────────────────
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        if (!sku) {
            return res.status(400).json({ message: "Variant SKU is required" });
        }

        // ───────────────── FETCH PRODUCT ─────────────────
        const product = await Product.findById(productId)
            .select("name brandSlug categorySlug variants");

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // ───────────────── FIND VARIANT BY SKU ─────────────────
        const variant = product.variants.find(v => v.sku === sku);

        if (!variant) {
            return res.status(404).json({
                message: "Variant not found for given SKU"
            });
        }

        // ───────────────── ADD TO WISHLIST ─────────────────
        await User.findByIdAndUpdate(
            userId,
            {
                $addToSet: {
                    wishlist: {
                        productId,
                        sku: variant.sku,                 // ✅ REQUIRED
                        shadeName: variant.shadeName,     // snapshot
                        name: product.name,               // snapshot
                        hex: variant.hex || null,
                        image: variant.images?.[0] || null
                    }
                }
            },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: "Added to wishlist"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

export const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user._id;

        await User.findByIdAndUpdate(userId, {
            $pull: { wishlist: { productId } }
        });

        res.status(200).json({
            success: true,
            message: "Removed from wishlist"
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// // 📌 Get all wishlist items (with promotions enrichment)
// export const getWishlist = async (req, res) => {
//     try {
//         const redis = getRedis();
//         const userId = req.user._id;

//         // -------------------------------
//         // 1. Fetch wishlist product IDs
//         // -------------------------------
//         const user = await User.findById(userId).select("wishlist").lean();
//         if (!user) {
//             return res.status(404).json({ success: false, message: "User not found" });
//         }

//         // Extract only product IDs
//         const wishlistIds = (user.wishlist || []).map(item => item.productId);
//         if (!wishlistIds.length) {
//             return res.status(200).json({ success: true, count: 0, wishlist: [] });
//         }

//         // -------------------------------
//         // 2. Fetch full product docs for wishlist
//         // -------------------------------
//         const products = await Product.find({ _id: { $in: wishlistIds }, isPublished: true })
//             .select(`
//                 name slugs price discountedPrice minPrice maxPrice 
//                 images variants brand category avgRating totalRatings
//                 description howToUse ingredients features supportsVTO vtoType
//             `)
//             .populate("brand", "name slug")
//             .populate("category", "name slug ancestors bannerImage thumbnailImage")
//             .lean();

//         // -------------------------------
//         // 3. Promotions (same as category API)
//         // -------------------------------
//         let promotions = await redis.get("active_promotions");
//         if (!promotions) {
//             promotions = await Promotion.find({
//                 status: "active",
//                 startDate: { $lte: new Date() },
//                 endDate: { $gte: new Date() }
//             }).lean();
//             await redis.set("active_promotions", JSON.stringify(promotions), "EX", 120);
//         } else {
//             promotions = JSON.parse(promotions);
//         }

//         // -------------------------------
//         // 4. Enrich products (same output as Category API)
//         // -------------------------------
//         const enrichedWishlist = await enrichProductsUnified(products, promotions);

//         // -------------------------------
//         // 5. Send response in same style
//         // -------------------------------
//         return res.status(200).json({
//             success: true,
//             count: enrichedWishlist.length,
//             wishlist: enrichedWishlist
//         });

//     } catch (err) {
//         console.error("❌ getWishlist error:", err);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to load wishlist"
//         });
//     }
// };

export const getWishlist = async (req, res) => {
    try {
        const redis = getRedis();
        const userId = req.user._id;

        // --------------------------------
        // 1. Fetch wishlist (productId + sku)
        // --------------------------------
        const user = await User.findById(userId)
            .select("wishlist")
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (!user.wishlist?.length) {
            return res.status(200).json({
                success: true,
                count: 0,
                wishlist: []
            });
        }

        const wishlistMap = new Map();

        for (const item of user.wishlist) {
            const pid = item.productId.toString();

            if (!wishlistMap.has(pid)) {
                wishlistMap.set(pid, []);
            }

            wishlistMap.get(pid).push(item.sku);
        }

        const productIds = [...wishlistMap.keys()];

        // --------------------------------
        // 2. Fetch products
        // --------------------------------
        const products = await Product.find({
            _id: { $in: productIds },
            isPublished: true
        })
            .select(`
                name slugs price discountedPrice minPrice maxPrice
                variants brand category avgRating totalRatings
                description howToUse ingredients features
                supportsVTO vtoType
            `)
            .populate("brand", "name slug")
            .populate("category", "name slug ancestors bannerImage thumbnailImage")
            .lean();

        // --------------------------------
        // 3. Keep ONLY selected SKU variant
        // --------------------------------
        const wishlistProducts = products
            .map(product => {
                const skus = wishlistMap.get(product._id.toString());

                const selectedVariants = product.variants?.filter(v =>
                    skus.includes(v.sku)
                );

                if (!selectedVariants.length) return null;

                return {
                    ...product,
                    variants: selectedVariants,
                    selectedSkus: skus
                };

            })
            .filter(Boolean);

        if (!wishlistProducts.length) {
            return res.status(200).json({
                success: true,
                count: 0,
                wishlist: []
            });
        }

        // --------------------------------
        // 4. Promotions (unchanged)
        // --------------------------------
        let promotions = await redis.get("active_promotions");
        if (!promotions) {
            promotions = await Promotion.find({
                status: "active",
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() }
            }).lean();

            await redis.set(
                "active_promotions",
                JSON.stringify(promotions),
                "EX",
                120
            );
        } else {
            promotions = JSON.parse(promotions);
        }

        // --------------------------------
        // 5. Enrich (same as category API)
        // --------------------------------
        const enrichedWishlist =
            await enrichProductsUnified(wishlistProducts, promotions);
        // --------------------------------
        // 6. Shape FINAL wishlist response
        // --------------------------------
        const compactWishlist = enrichedWishlist.flatMap(product =>
            product.variants.map(v => ({
                productId: product._id,
                name: product.name,

                variant: v.shadeName || null,
                sku: v.sku,

                image: Array.isArray(v.images) && v.images.length
                    ? v.images[0]
                    : null,

                displayPrice: v.displayPrice ?? null,
                originalPrice: v.originalPrice ?? null,
                discountPercent: v.discountPercent ?? 0,

                status: v.status || "outOfStock",

                avgRating: product.avgRating || 0,
                totalRatings: product.totalRatings || 0
            }))
        );


        // --------------------------------
        // 7. Response
        // --------------------------------
        return res.status(200).json({
            success: true,
            count: compactWishlist.length,
            wishlist: compactWishlist
        });


    } catch (err) {
        console.error("❌ getWishlist error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to load wishlist"
        });
    }
};


// Move from wishlist to cart
// export const moveToCart = async (req, res) => {
//     try {
//         const { productId } = req.params;
//         const userId = req.user._id;

//         // 1️⃣ Add product to cart
//         await User.findByIdAndUpdate(userId, {
//             $push: { cart: { product: productId, qty: 1 } }  // or use your cart logic
//         });

//         // 2️⃣ Remove product from wishlist
//         await User.findByIdAndUpdate(userId, {
//             $pull: { wishlist: productId }
//         });

//         res.status(200).json({ success: true, message: "Moved to cart" });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };


export const moveToCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const { sku } = req.body;
        const userId = req.user._id;

        if (!sku) {
            return res.status(400).json({ message: "Variant SKU is required" });
        }

        // 1️⃣ Fetch product & variant (safety)
        const product = await Product.findById(productId).select("variants");
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const variant = product.variants.find(v => v.sku === sku);
        if (!variant) {
            return res.status(404).json({ message: "Variant not found" });
        }

        // 2️⃣ Add to cart (variant-aware, deduplicated)
        await User.updateOne(
            {
                _id: userId,
                "cart.product": { $ne: productId } // prevent blind duplicates
            },
            {
                $push: {
                    cart: {
                        product: productId,
                        quantity: 1,
                        selectedVariant: {
                            sku: variant.sku,
                            shadeName: variant.shadeName || null,
                            hex: variant.hex || null,
                            image: variant.images?.[0] || null
                        }
                    }
                }
            }
        );

        // 3️⃣ Remove ONLY that variant from wishlist
        await User.updateOne(
            { _id: userId },
            {
                $pull: {
                    wishlist: {
                        productId,
                        sku
                    }
                }
            }
        );

        // 4️⃣ Invalidate cart cache
        await invalidateCartCache(userId, req.sessionID);

        return res.status(200).json({
            success: true,
            message: "Moved to cart successfully"
        });

    } catch (err) {
        console.error("moveToCart error:", err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
