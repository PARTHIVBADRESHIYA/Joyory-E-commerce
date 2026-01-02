import User from "../../models/User.js";
import Discount from "../../models/Discount.js";
import {
  validateDiscountForCartInternal
} from "../../controllers/user/userDiscountController.js"; // import helpers
import Product from "../../models/Product.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import GiftCard from "../../models/GiftCard.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";
import Promotion from "../../models/Promotion.js";
import { enrichProductWithStockAndOptions, enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { getRedis } from "../../middlewares/utils/redis.js";
import crypto from "crypto";
import UserActivity from "../../models/UserActivity.js";

async function invalidateCartCache(userId, sessionId) {
  const redis = getRedis();

  try {
    // ---------- LOGGED-IN USER ----------
    if (userId) {
      await redis.del(`usercart:${userId}`);

      const userCartKeys = await redis.keys(`cart:${userId}:*`);
      if (userCartKeys.length) {
        await redis.del(...userCartKeys);
      }

      const couponKeys = await redis.keys(`coupon:${userId}:*`);
      if (couponKeys.length) {
        await redis.del(...couponKeys);
      }
    }

    // ---------- GUEST USER ----------
    if (!userId && sessionId) {
      const guestCartKeys = await redis.keys(`cart:${sessionId}:*`);
      if (guestCartKeys.length) {
        await redis.del(...guestCartKeys);
      }
    }

  } catch (err) {
    console.error("invalidateCartCache failed:", err);
  }
}

export const getCart = async (req, res) => {
  const user = await User.findById(req.user._id).populate("cart.product");
  res.status(200).json({ cart: user.cart });
};

export const updateCartItem = async (req, res) => {
  const { productId, quantity, variantSku } = req.body;
  const user = await User.findById(req.user._id);

  const item = user.cart.find(
    p =>
      p.product.toString() === productId &&
      (!variantSku || p.selectedVariant?.sku === variantSku)
  );
  if (!item) return res.status(404).json({ message: "Product not in cart" });

  item.quantity = quantity;
  await user.save();

  res.status(200).json({ message: "✅ Cart updated", cart: user.cart });
};

export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const { variantSku } = req.query; // ✅ read from query
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Filter cart items
    const updatedCart = user.cart.filter(item => {
      // Keep items with different product
      if (String(item.product) !== String(productId)) return true;

      // If variantSku is provided, remove only that variant
      if (variantSku) return item.selectedVariant?.sku !== variantSku;

      // If no variantSku, remove all variants of the product
      return false;
    });

    // Save updated cart
    user.cart = updatedCart;
    await user.save();

    await invalidateCartCache(req.user?._id, req.sessionID);

    const removedMessage = variantSku
      ? `Variant ${variantSku} removed from cart`
      : `All variants of product removed from cart`;

    res.status(200).json({ message: removedMessage, cart: user.cart });
  } catch (err) {
    console.error("removeFromCart error:", err);
    res.status(500).json({ message: "Error removing from cart", error: err.message });
  }
};

export const mergeGuestCart = async (userId, guestCart = []) => {
  if (!guestCart.length) return;

  const user = await User.findById(userId);
  if (!user) return;

  for (const guestItem of guestCart) {
    const existing = user.cart.find(
      i => i.product.toString() === guestItem.product.toString() &&
        i.selectedVariant?.sku === guestItem.selectedVariant?.sku
    );

    if (existing) existing.quantity += guestItem.quantity;
    else user.cart.push(guestItem);
  }

  await user.save();
};

export const addToCart = async (req, res) => {
  try {
    const { productId, variants = [], quantity: qty = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found." });

    let cart;

    try {
      if (req.user?._id) {
        // Logged-in user flow
        const user = await User.findById(req.user._id); await user.save();

        cart = await handleCart(user.cart, product, variants, qty);
        user.cart = cart;
        await user.save();

        // 🔥 Track add-to-cart activity
        await UserActivity.create({
          user: user._id,
          type: "add_to_cart",
          product: product._id
        });

        // 🔥 Funnel tracking: Add to Cart
        await User.findByIdAndUpdate(
          req.user._id,
          [
            {
              $set: {
                "conversionStats.addToCartCount": {
                  $add: [
                    { $ifNull: ["$conversionStats.addToCartCount", 0] },
                    1
                  ]
                }
              }
            }
          ]
        );
      } else {
        // Guest flow
        cart = await handleCart(req.session.guestCart, product, variants, qty);
        req.session.guestCart = cart;
        await new Promise((resolve, reject) => {
          req.session.save(err => (err ? reject(err) : resolve()));
        });
      }
    } catch (validationErr) {
      // 🧠 Known validation issue (like stock or variant error)
      return res.status(400).json({
        success: false,
        message: validationErr.message,
      });
    }

    await invalidateCartCache(req.user?._id, req.sessionID);

    res.status(200).json({
      success: true,
      message: "✅ Added to cart successfully!",
      cart,
    });
  } catch (err) {
    console.error("❌ addToCart server error:", err);
    res.status(500).json({
      success: false,
      message: "Oops! Something went wrong. Please try again later.",
    });
  }
};

// Helper to add/update cart items
async function handleCart(cart, product, variants, qty) {
  if (!Array.isArray(cart)) cart = [];

  // 🧩 CASE 1 — Non-variant product
  if (variants.length === 0) {
    const stock = Number(product.quantity ?? 0);

    if (stock <= 0) {
      throw new Error("This product is currently out of stock.");
    }

    if (qty > stock) {
      throw new Error(`Only ${stock} item(s) available in stock.`);
    }

    const existing = cart.find(
      item => item.product.toString() === product._id.toString() && !item.selectedVariant
    );

    if (existing) {
      if (existing.quantity + qty > stock) {
        const canAdd = Math.max(0, stock - existing.quantity);
        throw new Error(
          `You can only add ${canAdd} more item${canAdd !== 1 ? "s" : ""} for this product.`
        );
      }
      existing.quantity += qty;
    } else {
      cart.push({ product: product._id, quantity: qty, selectedVariant: null });
    }

    return cart;
  }

  // 🧩 CASE 2 — Variant product
  for (const { variantSku, quantity } of variants) {
    if (!quantity || quantity <= 0) continue;

    const variant = product.variants.find(v => v.sku === variantSku);
    if (!variant)
      throw new Error(`This product variant is no longer available.`);

    const stock = Number(variant.stock ?? 0);

    if (stock <= 0) {
      throw new Error(`${variant.shadeName || "This variant"} is out of stock.`);
    }

    // 🛑 Stock check — prevent adding beyond available
    if (quantity > stock) {
      throw new Error(
        `Only ${stock} item(s) available for ${variant.shadeName || variantSku}.`
      );
    }

    const existing = cart.find(
      item =>
        item.product.toString() === product._id.toString() &&
        item.selectedVariant?.sku === variantSku
    );

    if (existing) {
      if (existing.quantity >= stock) {
        // already at or above stock
        throw new Error(
          `Only ${stock} item${stock !== 1 ? "s" : ""} available for ${variant.shadeName || variantSku}.`
        );
      }

      if (existing.quantity + quantity > stock) {
        const canAdd = Math.max(0, stock - existing.quantity);
        throw new Error(
          `You can only add ${canAdd} more item${canAdd !== 1 ? "s" : ""} for ${variant.shadeName || variantSku}.`
        );
      }

      existing.quantity += quantity;
    }
    else {
      const selectedVariant = {
        sku: variant.sku,
        shadeName: variant.shadeName || null,
        hex: variant.hex || null,
        images: variant.images?.length ? variant.images : product.images || [],
        price: variant.price ?? product.price,
        discountedPrice: variant.discountedPrice ?? product.discountedPrice ?? product.price,
        stock,
      };

      cart.push({ product: product._id, quantity, selectedVariant });
    }
  }

  return cart;
}

// // // --- CACHES / TTLs ---
// let _promoCache = { data: null, ts: 0, ttl: 5000 };   // existing (kept)
// let _couponCache = { data: null, ts: 0, ttl: 5000 };  // existing (kept)

// const PRODUCT_CACHE_TTL = 300;        // 5 minutes for raw product doc
// const ENRICHED_PRODUCT_TTL = 20;      // 20 seconds for enriched product (max-speed)
// const PROMO_CACHE_TTL = 20;           // 20s promo cache in redis layer
// const COUPON_CACHE_TTL = 20;          // 20s coupon cache in redis layer
// const CART_CACHE_TTL = 60;            // 60s cart snapshot cache

// // ---------- helper: get raw product from cache/db ----------
// async function getCachedProduct(productId) {
//   if (!productId) return null;

//   const redis = getRedis();   // 🔥 REQUIRED

//   const key = `prod:${productId}`;
//   try {
//     const cached = await redis.get(key);
//     if (cached) return JSON.parse(cached);
//   } catch (e) {
//     // swallow redis parse errors and fallback to DB
//     console.error("redis.get prod failed", e);
//   }

//   const doc = await Product.findById(productId).lean();
//   if (doc) {
//     try {
//       await redis.set(key, JSON.stringify(doc), "EX", PRODUCT_CACHE_TTL);
//     } catch (e) {
//       console.error("redis.set prod failed", e);
//     }
//   }
//   return doc;
// }

// // batch fetch raw products (redis-first)
// async function getMultipleProducts(ids = []) {
//   if (!ids || !ids.length) return [];
//   // fetch in parallel
//   const proms = ids.map(id => getCachedProduct(id));
//   return Promise.all(proms);
// }

// // ---------- helper: get enriched product (cache per promoHash) ----------
// async function getEnrichedProduct(product, promoHash, activePromotions) {
//   if (!product) return null;
//   const redis = getRedis();  // 🔥 REQUIRED

//   const id = String(product._id);
//   const key = `enriched:product:${id}:${promoHash || "nopromo"}`;

//   try {
//     const cached = await redis.get(key);
//     if (cached) return JSON.parse(cached);
//   } catch (e) {
//     console.error("redis.get enriched failed", e);
//   }

//   // enrich synchronously using your function
//   // NOTE: enrichProductWithStockAndOptions is synchronous in your code
//   let enriched;
//   try {
//     enriched = enrichProductWithStockAndOptions(product, activePromotions || []);
//   } catch (err) {
//     // fallback to a minimal enriched structure preserving fields
//     console.error("enrichProductWithStockAndOptions error:", err);
//     enriched = {
//       ...product,
//       variants: product.variants?.map(v => ({
//         ...v,
//         originalPrice: Number(v.mrp ?? v.price ?? product.mrp ?? product.price ?? 0),
//         displayPrice: Number(v.discountedPrice ?? v.price ?? product.price ?? 0),
//         discountPercent: 0,
//         discountAmount: 0,
//       })) || [],
//       selectedVariant: product.variants?.[0] || null,
//     };
//   }

//   try {
//     await redis.set(key, JSON.stringify(enriched), "EX", ENRICHED_PRODUCT_TTL);
//   } catch (e) {
//     console.error("redis.set enriched failed", e);
//   }
//   return enriched;
// }

// // ---------- small util to hash promotions (stable) ----------
// function promoHashFromPromos(promos = []) {
//   try {
//     // Use promo ids + updatedAt if available to make key sensitive to changes
//     const arr = (promos || []).map(p => {
//       const id = p._id ? String(p._id) : JSON.stringify(p);
//       const t = p.updatedAt ? String(new Date(p.updatedAt).getTime()) : (p.ts || "");
//       return id + ":" + t;
//     });
//     const raw = arr.sort().join("|");
//     return crypto.createHash("md5").update(raw || "").digest("hex");
//   } catch (err) {
//     return "nopromohash";
//   }
// }

// // ---------- MAIN optimized controller (drop-in) ----------
// export const getCartSummary = async (req, res) => {
//   try {

//     const redis = getRedis();  // 🔥 REQUIRED FIX

//     // -------------------- Redis snapshot cache --------------------
//     const cartKeySnapshot = (() => {
//       try {
//         const cartItemsSnapshot = (req.user && req.user._id && req.user.cart)
//           ? req.user.cart.map(i => ({
//             product: String(i.product?._id || i.product),
//             qty: i.quantity,
//             sku: i.selectedVariant?.sku || null,
//           }))
//           : (req.session?.guestCart || []).map(i => ({
//             product: String(i.product),
//             qty: i.quantity,
//             sku: i.selectedVariant?.sku || null,
//           }));

//         return JSON.stringify({
//           userId: req.user?._id ? String(req.user._id) : null,
//           sessionId: req.sessionID || null,
//           items: cartItemsSnapshot,
//           q: {
//             discount: req.query.discount || null,
//           },
//         });
//       } catch {
//         return null;
//       }
//     })();

//     const snapshotHash = crypto
//       .createHash("md5")
//       .update(cartKeySnapshot || "")
//       .digest("hex");


//     const redisKey = `cart:${req.user?._id || req.sessionID}:${snapshotHash}`;

//     // Try fast path: return cached cart snapshot
//     try {
//       const cached = await redis.get(redisKey);
//       if (cached) return res.status(200).json(JSON.parse(cached));
//     } catch (err) {
//       console.error("Redis get failed:", err);
//       // degrade gracefully
//     }

//     // -------------------- Determine Cart Source --------------------
//     let cartSource;
//     let isGuest = false;

//     if (req.user && req.user._id) {
//       const user = await User.findById(req.user._id).select("cart").lean();
//       if (!user) return res.status(404).json({ message: "User not found" });
//       cartSource = (user.cart || []).filter(item => item && item.product);
//     } else if (req.session?.guestCart?.length) {
//       isGuest = true;
//       cartSource = req.session.guestCart;
//     } else {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     if (!cartSource.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     const validCartItems = cartSource;

//     // -------------------- Build itemsInput for promotions --------------------
//     const itemsInput = validCartItems.map(i => ({
//       productId: String(i.product?._id || i.product),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     // Normalize SKU case to avoid mismatches during applyPromotions
//     itemsInput.forEach(i => {
//       if (i.selectedVariant && i.selectedVariant.sku) {
//         i.selectedVariant.sku = String(i.selectedVariant.sku).trim().toLowerCase();
//       }
//     });

//     // Precompute product id list for parallel DB ops
//     const productIds = validCartItems.map(i => String(i.product?._id || i.product));
//     const uniqueIds = [...new Set(productIds)];

//     // -------------------- Kick off parallel loads (optimized) --------------------
//     // don't change helpers — we call them as-is
//     const applyPromotionsPromise = applyPromotions(itemsInput, {
//       userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
//     });

//     // Coupon docs (cache layer)
//     const loadCouponsPromise = (async () => {
//       try {
//         const now = Date.now();
//         if (_couponCache.data && now - _couponCache.ts < (_couponCache.ttl || COUPON_CACHE_TTL * 1000)) {
//           return _couponCache.data;
//         }
//         const docs = await Discount.find({ status: "Active" }).lean();
//         _couponCache = { data: docs, ts: Date.now(), ttl: COUPON_CACHE_TTL * 1000 };
//         return docs;
//       } catch (err) {
//         console.error("Failed to load coupons:", err);
//         return [];
//       }
//     })();

//     // Promotions (cache layer)
//     const loadActivePromotionsPromise = (async () => {
//       try {
//         const now = Date.now();
//         if (_promoCache.data && now - _promoCache.ts < (_promoCache.ttl || PROMO_CACHE_TTL * 1000)) {
//           return _promoCache.data;
//         }
//         const dbNow = new Date();
//         const promos = await Promotion.find({
//           status: "active",
//           startDate: { $lte: dbNow },
//           endDate: { $gte: dbNow },
//         }).lean();
//         _promoCache = { data: promos, ts: Date.now(), ttl: PROMO_CACHE_TTL * 1000 };
//         return promos;
//       } catch (err) {
//         console.error("Failed to load promotions:", err);
//         return [];
//       }
//     })();

//     // Raw products loaded via redis-first helper
//     const loadProductsPromise = getMultipleProducts(uniqueIds);

//     // Run heavy loads in parallel
//     const [promoResult, allDiscountDocs, activePromotions, allProducts] = await Promise.all([
//       applyPromotionsPromise,
//       loadCouponsPromise,
//       loadActivePromotionsPromise,
//       loadProductsPromise,
//     ]);

//     const {
//       items: promoItems,
//       summary,
//       appliedPromotions,
//       freebies = []
//     } = promoResult || {
//       items: [],
//       summary: {},
//       appliedPromotions: [],
//       freebies: []
//     };

//     // -------------------- Coupons Evaluation (unchanged logic) --------------------
//     let applicableCoupons = [],
//       inapplicableCoupons = [],
//       appliedCoupon = null,
//       discountFromCoupon = 0;

//     if (req.user && req.user._id) {
//       const nonPromoItemsInput = (promoItems || [])
//         .filter(i => !i.discounts?.length)
//         .map(i => ({
//           productId: i.productId,
//           qty: i.qty,
//         }));

//       if (nonPromoItemsInput.length && Array.isArray(allDiscountDocs) && allDiscountDocs.length) {
//         const couponsChecked = await Promise.all(
//           allDiscountDocs.map(async d => {
//             try {
//               await validateDiscountForCartInternal({
//                 code: d.code,
//                 cart: nonPromoItemsInput,
//                 userId: req.user._id,
//               });

//               return {
//                 code: d.code,
//                 label: d.name,
//                 type: d.type,
//                 value: d.value,
//                 status: "Applicable",
//                 message: `Apply code ${d.code}`,
//               };
//             } catch {
//               return {
//                 code: d.code,
//                 label: d.name,
//                 type: d.type,
//                 value: d.value,
//                 status: "Not applicable",
//                 message: "Not valid for current cart",
//               };
//             }
//           })
//         );

//         applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
//         inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

//         if (req.query.discount && nonPromoItemsInput.length) {
//           try {
//             const result = await validateDiscountForCartInternal({
//               code: req.query.discount.trim(),
//               cart: nonPromoItemsInput,
//               userId: req.user._id,
//             });

//             const CAP = result.discount.maxCap || 500;
//             discountFromCoupon = Math.min(result.priced.discountAmount, CAP);

//             appliedCoupon = {
//               code: result.discount.code,
//               discount: discountFromCoupon,
//             };
//           } catch {
//             appliedCoupon = null;
//             discountFromCoupon = 0;
//           }
//         }
//       } else {
//         applicableCoupons = [];
//         inapplicableCoupons = Array.isArray(allDiscountDocs) ? allDiscountDocs.map(d => ({
//           code: d.code,
//           label: d.name,
//           type: d.type,
//           value: d.value,
//           status: "Not applicable",
//           message: "Not valid for current cart",
//         })) : [];
//       }
//     }

//     // -------------------- Enrich products (cached per promotion state) --------------------
//     const promoHash = promoHashFromPromos(activePromotions || []);

//     // allProducts may contain nulls for missing; ensure clean list
//     const rawProducts = (allProducts || []).filter(Boolean);

//     // Pre-enrich all products in parallel (caches per promoHash)
//     const enrichedPromises = rawProducts.map(p => getEnrichedProduct(p, promoHash, activePromotions || []));
//     const enrichedProducts = await Promise.all(enrichedPromises);

//     // Build product map from enriched products (keep ids as strings)
//     const productMap = new Map((enrichedProducts || []).filter(Boolean).map(p => [String(p._id), p]));

//     // -------------------- Build Final Cart (synchronous mapping) --------------------
//     const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

//     const finalCart = validCartItems.map(item => {
//       const productIdStr = String(item.product?._id || item.product);
//       const productFromDB = productMap.get(productIdStr);

//       // product removed
//       if (!productFromDB) {
//         return {
//           _id: item._id,
//           product: null,
//           name: "Product unavailable",
//           quantity: item.quantity || 1,
//           stockStatus: "deleted",
//           stockMessage: "❌ This product was removed by admin.",
//           canCheckout: false,
//           variant: {
//             sku: item.selectedVariant?.sku || null,
//             shadeName: null,
//             hex: null,
//             image: null,
//             stock: 0,
//             originalPrice: 0,
//             discountedPrice: 0,
//             displayPrice: 0,
//             discountPercent: 0,
//             discountAmount: 0,
//           },
//         };
//       }

//       const enriched = productFromDB; // already enriched
//       const enrichedVariant =
//         enriched.variants.find(
//           v => String(v.sku || "").trim().toLowerCase() === String(item.selectedVariant?.sku || "").trim().toLowerCase()
//         ) || enriched.variants[0];

//       const stock = enrichedVariant.stock ?? 0;
//       let stockStatus = "in_stock";
//       let stockMessage = "";

//       if (stock <= 0) {
//         stockStatus = "out_of_stock";
//         stockMessage = "⚠️ This item is currently out of stock.";
//       } else if (stock < item.quantity) {
//         stockStatus = "limited_stock";
//         stockMessage = `Only ${stock} left in stock.`;
//       }

//       return {
//         _id: item._id,
//         product: productFromDB._id,
//         name: enrichedVariant.shadeName
//           ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
//           : productFromDB.name,
//         quantity: item.quantity || 1,
//         stockStatus,
//         stockMessage,
//         canCheckout: stock > 0 && stock >= item.quantity,
//         variant: {
//           sku: enrichedVariant.sku,
//           shadeName: enrichedVariant.shadeName,
//           hex: enrichedVariant.hex,
//           image: enrichedVariant.images?.[0] || productFromDB.images?.[0] || null,
//           stock,
//           originalPrice: enrichedVariant.originalPrice,
//           discountedPrice: enrichedVariant.displayPrice,
//           displayPrice: enrichedVariant.displayPrice,
//           discountPercent: enrichedVariant.discountPercent,
//           discountAmount: enrichedVariant.discountAmount,
//         },
//         freebies: item.freebies || [],   // 🔥 ADD THIS

//       };
//     });

//     // -------------------- Price Calculation --------------------
//     const activeItems = finalCart.filter(i => i.stockStatus !== "deleted");

//     const bagMrp = round2(
//       activeItems.reduce(
//         (sum, i) => sum + i.variant.originalPrice * i.quantity,
//         0
//       )
//     );

//     const sellingTotal = round2(
//       activeItems.reduce(
//         (sum, i) => sum + i.variant.displayPrice * i.quantity,
//         0
//       )
//     );

//     const productDiscount = round2(bagMrp - sellingTotal);

//     const bogoDiscount = round2(
//       promoItems.reduce((s, i) => s + (i._bogoFreeAmount || 0), 0)
//     );

//     const bagPayable = round2(sellingTotal - bogoDiscount);



//     const totalSavings = round2(
//       bagMrp - bagPayable + discountFromCoupon
//     );

//     let grandTotal = round2(bagPayable - discountFromCoupon);

//     // -------------------- Shipping --------------------
//     const SHIPPING_CHARGE = 70;
//     const FREE_SHIPPING_THRESHOLD = 499;

//     let shippingCharge = 0;
//     let shippingMessage = "";

//     if (summary.freeShipping) {
//       shippingCharge = 0;
//       shippingMessage = "🚚 Free shipping via promotion!";
//     } else if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//       shippingCharge = 0;
//       shippingMessage = "🎉 Free shipping on your order!";
//     } else {
//       shippingCharge = SHIPPING_CHARGE;
//       const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
//       shippingMessage = `📦 Add ₹${amountToFree} more for free shipping!`;
//       grandTotal += SHIPPING_CHARGE;
//     }

//     // -------------------- GST Calculation --------------------
//     const GST_RATE = 0.12; // 12%

//     const taxableAmount = round2(bagPayable - discountFromCoupon);

//     const gstAmount = round2(taxableAmount * GST_RATE);

//     const payableWithGST = round2(taxableAmount + gstAmount);


//     // Friendly message (frontend ready)
//     const gstMessage = `🧾 Includes 12% GST (₹${gstAmount})`;


//     // -------------------- Final Response --------------------
//     const responseData = {
//       cart: finalCart,
//       // 👇👇 ADD THIS
//       freebies: freebies.map(f => ({
//         productId: f.productId,
//         name: f.name || "",
//         qty: f.qty || f.quantity || 1,
//         variant: f.variant || null,
//         price: 0,
//         message: f.message || "Free item"
//       })),
//       priceDetails: {
//         bagMrp,
//         totalSavings,
//         bagDiscount: round2(bagMrp - bagPayable),
//         autoDiscount: round2(bagMrp - bagPayable),
//         couponDiscount: round2(discountFromCoupon),
//         shippingCharge: round2(shippingCharge),
//         shippingMessage,
//         taxableAmount,       // 🔥 important
//         gstRate: "12%",
//         gstAmount,
//         gstMessage,
//         payable: payableWithGST,
//         promoFreeShipping: !!summary.freeShipping,
//         savingsMessage:
//           totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
//       },
//       appliedCoupon,
//       appliedPromotions,

//       // 👇 include raw freebies here too for debugging
//       rawFreebies: freebies,
//       applicableCoupons,
//       inapplicableCoupons,
//       grandTotal: payableWithGST,
//       isGuest,
//     };

// // Cache the final response (longer TTL)
// try {
//   await redis.set(redisKey, JSON.stringify(responseData), "EX", CART_CACHE_TTL);
// } catch (err) {
//   console.error("Redis set failed:", err);
// }

//     return res.json(responseData);
//   } catch (error) {
//     console.error("❌ getCartSummary error:", error);
//     return res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };

//complete above parrt till 24/12/2025 means all complte just need optimization so bottom part try catch ok,.. 





// --- CACHES / TTLs ---
let _promoCache = { data: null, ts: 0, ttl: 5000 };   // existing (kept)
let _couponCache = { data: null, ts: 0, ttl: 5000 };  // existing (kept)

const PRODUCT_CACHE_TTL = 300;        // 5 minutes for raw product doc
const ENRICHED_PRODUCT_TTL = 20;      // 20 seconds for enriched product (max-speed)
const PROMO_CACHE_TTL = 60;           // 20s promo cache in redis layer
const COUPON_CACHE_TTL = 20;          // 20s coupon cache in redis layer
const CART_CACHE_TTL = 60;            // 60s cart snapshot cache

// ---------- helper: get raw product from cache/db ----------
async function getCachedProduct(productId) {
  if (!productId) return null;

  const redis = getRedis();   // 🔥 REQUIRED

  const key = `prod:${String(productId).trim()}`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // swallow redis parse errors and fallback to DB
    console.error("redis.get prod failed", e);
  }

  const doc = await Product.findById(productId).lean();
  if (doc) {
    try {
      await redis.set(key, JSON.stringify(doc), "EX", PRODUCT_CACHE_TTL);
    } catch (e) {
      console.error("redis.set prod failed", e);
    }
  }
  return doc;
}

// batch fetch raw products (redis-first)
async function getMultipleProducts(ids = []) {
  if (!ids || !ids.length) return [];
  // fetch in parallel
  const proms = ids.map(id => getCachedProduct(id));
  return Promise.all(proms);
}

// ---------- helper: get enriched product (cache per promoHash) ----------
async function getEnrichedProduct(product, promoHash, activePromotions) {
  if (!product) return null;
  const redis = getRedis();  // 🔥 REQUIRED

  const id = String(product._id);
  const key = `enrp:${id}:${promoHash}`;

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.error("redis.get enriched failed", e);
  }

  // enrich synchronously using your function
  // NOTE: enrichProductWithStockAndOptions is synchronous in your code
  let enriched;
  try {
    enriched = enrichProductWithStockAndOptions(product, activePromotions || []);
  } catch (err) {
    // fallback to a minimal enriched structure preserving fields
    console.error("enrichProductWithStockAndOptions error:", err);
    enriched = {
      ...product,
      variants: product.variants?.map(v => ({
        ...v,
        originalPrice: Number(v.mrp ?? v.price ?? product.mrp ?? product.price ?? 0),
        displayPrice: Number(v.discountedPrice ?? v.price ?? product.price ?? 0),
        discountPercent: 0,
        discountAmount: 0,
      })) || [],
      selectedVariant: product.variants?.[0] || null,
    };
  }

  try {
    await redis.set(key, JSON.stringify(enriched), "EX", ENRICHED_PRODUCT_TTL);
  } catch (e) {
    console.error("redis.set enriched failed", e);
  }
  return enriched;
}

// ---------- small util to hash promotions (stable) ----------
function promoHashFromPromos(promos = []) {
  try {
    // Use promo ids + updatedAt if available to make key sensitive to changes
    const arr = (promos || []).map(p => {
      const id = p._id ? String(p._id) : JSON.stringify(p);
      const t = p.updatedAt ? String(new Date(p.updatedAt).getTime()) : (p.ts || "");
      return id + ":" + t;
    });
    const raw = arr.sort().join("|");
    return crypto.createHash("md5").update(raw || "").digest("hex");
  } catch (err) {
    return "nopromohash";
  }
}

// ---------- MAIN optimized controller (drop-in) ----------
export const getCartSummary = async (req, res) => {
  try {

    const redis = getRedis();  // 🔥 REQUIRED FIX

    // -------------------- Redis snapshot cache --------------------
    const cartKeySnapshot = (() => {
      try {
        const cartItemsSnapshot = (req.user && req.user._id && req.user.cart)
          ? req.user.cart.map(i => ({
            product: String(i.product?._id || i.product),
            qty: i.quantity,
            sku: i.selectedVariant?.sku || null,
          }))
          : (req.session?.guestCart || []).map(i => ({
            product: String(i.product),
            qty: i.quantity,
            sku: i.selectedVariant?.sku || null,
          }));

        return JSON.stringify({
          userId: req.user?._id ? String(req.user._id) : null,
          sessionId: req.sessionID || null,
          items: cartItemsSnapshot,
          q: {
            discount: req.query.discount || null,
          },
        });
      } catch {
        return null;
      }
    })();

    const snapshotHash = crypto
      .createHash("md5")
      .update(cartKeySnapshot || "")
      .digest("hex");

    const redisKey = `cart:${req.user?._id || req.sessionID}:${snapshotHash}`;

    // Try fast path: return cached cart snapshot
    try {
      const cached = await redis.get(redisKey);
      if (cached) return res.status(200).json(JSON.parse(cached));
    } catch (err) {
      console.error("Redis get failed:", err);
      // degrade gracefully
    }

    // -------------------- Determine Cart Source --------------------
    let cartSource;
    let isGuest = false;

    if (req.user && req.user._id) {
      if (req.user && req.user._id) {
        const userCartKey = `usercart:${req.user._id}`;

        // Try Redis first
        const cachedUserCart = await redis.get(userCartKey);

        if (cachedUserCart) {
          cartSource = JSON.parse(cachedUserCart);
        } else {
          const user = await User.findById(req.user._id).select("cart").lean();
          if (!user) return res.status(404).json({ message: "User not found" });

          cartSource = (user.cart || []).filter(it => it && it.product);

          await redis.set(
            userCartKey,
            JSON.stringify(cartSource),
            "EX",
            60 // 60 sec cache
          );
        }
      }

    } else if (req.session?.guestCart?.length) {
      isGuest = true;
      cartSource = req.session.guestCart;
    } else {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!cartSource.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const validCartItems = cartSource;

    // -------------------- Build itemsInput for promotions --------------------
    const itemsInput = validCartItems.map(i => ({
      productId: String(i.product?._id || i.product),
      qty: i.quantity,
      selectedVariant: i.selectedVariant || null,
    }));

    // Normalize SKU case to avoid mismatches during applyPromotions
    itemsInput.forEach(i => {
      if (i.selectedVariant && i.selectedVariant.sku) {
        i.selectedVariant.sku = String(i.selectedVariant.sku).trim().toLowerCase();
      }
    });

    // Precompute product id list for parallel DB ops
    const productIds = validCartItems.map(i => String(i.product?._id || i.product));
    const uniqueIds = [...new Set(productIds)];

    // -------------------- Kick off parallel loads (optimized) --------------------
    // don't change helpers — we call them as-is
    // ----------- PROMO RESULT CACHE (BIG SPEED FIX) -----------
    const promoKey = `promo:${snapshotHash}`;
    let promoResult;

    const cachedPromo = await redis.get(promoKey);
    if (cachedPromo) {
      promoResult = JSON.parse(cachedPromo);
    } else {
      promoResult = await applyPromotions(itemsInput, {
        userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
      });

      await redis.set(promoKey, JSON.stringify(promoResult), "EX", 20);
    }


    // Coupon docs (cache layer)
    const loadCouponsPromise = (async () => {
      try {
        const now = Date.now();
        if (_couponCache.data && now - _couponCache.ts < (_couponCache.ttl || COUPON_CACHE_TTL * 1000)) {
          return _couponCache.data;
        }
        const docs = await Discount.find({ status: "Active" }).lean();
        _couponCache = { data: docs, ts: Date.now(), ttl: COUPON_CACHE_TTL * 1000 };
        return docs;
      } catch (err) {
        console.error("Failed to load coupons:", err);
        return [];
      }
    })();

    // Promotions (cache layer)
    const loadActivePromotionsPromise = (async () => {
      try {
        const now = Date.now();
        if (_promoCache.data && now - _promoCache.ts < (_promoCache.ttl || PROMO_CACHE_TTL * 1000)) {
          return _promoCache.data;
        }
        const dbNow = new Date();
        const promos = await Promotion.find({
          status: "active",
          startDate: { $lte: dbNow },
          endDate: { $gte: dbNow },
        }).lean();
        _promoCache = { data: promos, ts: Date.now(), ttl: PROMO_CACHE_TTL * 1000 };
        return promos;
      } catch (err) {
        console.error("Failed to load promotions:", err);
        return [];
      }
    })();

    // FIX: proper batched product fetch
    const loadProductsPromise = getMultipleProducts(uniqueIds);

    const [
      allDiscountDocs,
      activePromotions,
      allProducts
    ] = await Promise.all([
      loadCouponsPromise,
      loadActivePromotionsPromise,
      loadProductsPromise,
    ]);


    const {
      items: promoItems,
      summary,
      appliedPromotions,
      freebies = []
    } = promoResult || {
      items: [],
      summary: {},
      appliedPromotions: [],
      freebies: []
    };

    // -------------------- Coupons Evaluation (unchanged logic) --------------------
    // -------------------- Coupons Evaluation --------------------
    let applicableCoupons = [],
      inapplicableCoupons = [],
      appliedCoupon = null,
      discountFromCoupon = 0;

    if (req.user && req.user._id) {

      let continueCoupon = true;  // 🔥 CONTROL FLAG

      // ------------- COUPON CACHE START ----------------
      const couponKeyFinal = `coupon:${req.user._id}:${snapshotHash}`;
      const cachedCouponFinal = await redis.get(couponKeyFinal);

      if (cachedCouponFinal) {
        const parsed = JSON.parse(cachedCouponFinal);
        applicableCoupons = parsed.applicableCoupons;
        inapplicableCoupons = parsed.inapplicableCoupons;
        appliedCoupon = parsed.appliedCoupon;
        discountFromCoupon = parsed.discountFromCoupon;

        continueCoupon = false;  // 🔥 SKIP heavy logic completely
      }
      // -------------------------------------------------


      if (continueCoupon) {

        const nonPromoItemsInput = (promoItems || [])
          .filter(i => !i.discounts?.length)
          .map(i => ({
            productId: i.productId,
            qty: i.qty,
          }));

        if (nonPromoItemsInput.length && Array.isArray(allDiscountDocs) && allDiscountDocs.length) {
          const couponsChecked = await Promise.all(
            allDiscountDocs.map(async d => {
              try {
                await validateDiscountForCartInternal({
                  code: d.code,
                  cart: nonPromoItemsInput,
                  userId: req.user._id,
                });

                return {
                  discountId: String(d._id),
                  code: d.code,
                  label: d.name,
                  description: d.description,
                  type: d.type,
                  value: d.value,
                  status: "Applicable",
                  message: `Apply code ${d.code}`,
                };
              } catch {
                return {
                  discountId: String(d._id),
                  code: d.code,
                  label: d.name,
                  description: d.description,
                  type: d.type,
                  value: d.value,
                  status: "Not applicable",
                  message: "Not valid for current cart",
                };
              }
            })
          );

          applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
          inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

          // Apply selected coupon
          if (req.query.discount && nonPromoItemsInput.length) {
            try {
              const result = await validateDiscountForCartInternal({
                code: req.query.discount.trim(),
                cart: nonPromoItemsInput,
                userId: req.user._id,
              });

              const CAP = result.discount.maxCap || 500;
              discountFromCoupon = Math.min(result.priced.discountAmount, CAP);

              appliedCoupon = {
                code: result.discount.code,
                discount: discountFromCoupon,
              };
            } catch {
              appliedCoupon = null;
              discountFromCoupon = 0;
            }
          }

          // SAVE RESULT IN REDIS (🔥 REQUIRED)
          await redis.set(
            couponKeyFinal,
            JSON.stringify({
              applicableCoupons,
              inapplicableCoupons,
              appliedCoupon,
              discountFromCoupon
            }),
            "EX",
            COUPON_CACHE_TTL
          );

        } else {
          applicableCoupons = [];
          inapplicableCoupons = Array.isArray(allDiscountDocs)
            ? allDiscountDocs.map(d => ({
              code: d.code,
              label: d.name,
              type: d.type,
              value: d.value,
              status: "Not applicable",
              message: "Not valid for current cart",
            }))
            : [];
        }
      }
    }

    // -------------------- Enrich products (cached per promotion state) --------------------
    const promoHash = promoHashFromPromos(activePromotions || []);

    // allProducts may contain nulls for missing; ensure clean list
    const rawProducts = (allProducts || []).filter(Boolean);

    // Pre-enrich all products in parallel (caches per promoHash)
    const enrichedPromises = rawProducts.map(p => getEnrichedProduct(p, promoHash, activePromotions || []));
    const enrichedProducts = await Promise.all(enrichedPromises);

    // Build product map from enriched products (keep ids as strings)
    const productMap = new Map((enrichedProducts || []).filter(Boolean).map(p => [String(p._id), p]));

    // -------------------- Build Final Cart (synchronous mapping) --------------------
    const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

    const finalCart = validCartItems.map(item => {
      const productIdStr = String(item.product?._id || item.product).trim();
      const productFromDB = productMap.get(productIdStr);

      // product removed
      if (!productFromDB) {
        return {
          _id: item._id,
          product: null,
          name: "Product unavailable",
          quantity: item.quantity || 1,
          stockStatus: "deleted",
          stockMessage: "❌ This product was removed by admin.",
          canCheckout: false,
          variant: {
            sku: item.selectedVariant?.sku || null,
            shadeName: null,
            hex: null,
            image: null,
            stock: 0,
            originalPrice: 0,
            discountedPrice: 0,
            displayPrice: 0,
            discountPercent: 0,
            discountAmount: 0,
          },
        };
      }

      const enriched = productFromDB; // already enriched
      const enrichedVariant =
        enriched.variants.find(
          v => String(v.sku || "").trim().toLowerCase() === String(item.selectedVariant?.sku || "").trim().toLowerCase()
        ) || enriched.variants[0];

      const stock = enrichedVariant.stock ?? 0;
      let stockStatus = "in_stock";
      let stockMessage = "";

      if (stock <= 0) {
        stockStatus = "out_of_stock";
        stockMessage = "⚠️ This item is currently out of stock.";
      } else if (stock < item.quantity) {
        stockStatus = "limited_stock";
        stockMessage = `Only ${stock} left in stock.`;
      }

      return {
        _id: item._id,
        product: productFromDB._id,
        name: enrichedVariant.shadeName
          ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
          : productFromDB.name,
        quantity: item.quantity || 1,
        stockStatus,
        stockMessage,
        canCheckout: stock > 0 && stock >= item.quantity,
        variant: {
          sku: enrichedVariant.sku,
          shadeName: enrichedVariant.shadeName,
          hex: enrichedVariant.hex,
          image: enrichedVariant.images?.[0] || productFromDB.images?.[0] || null,
          stock,
          originalPrice: enrichedVariant.originalPrice,
          discountedPrice: enrichedVariant.displayPrice,
          displayPrice: enrichedVariant.displayPrice,
          discountPercent: enrichedVariant.discountPercent,
          discountAmount: enrichedVariant.discountAmount,
        },
        freebies: item.freebies || [],   // 🔥 ADD THIS

      };
    });

    // -------------------- Price Calculation --------------------
    const activeItems = finalCart.filter(i => i.stockStatus !== "deleted");

    const bagMrp = round2(
      activeItems.reduce(
        (sum, i) => sum + i.variant.originalPrice * i.quantity,
        0
      )
    );

    const sellingTotal = round2(
      activeItems.reduce(
        (sum, i) => sum + i.variant.displayPrice * i.quantity,
        0
      )
    );

    const productDiscount = round2(bagMrp - sellingTotal);

    const bogoDiscount = round2(
      promoItems.reduce((s, i) => s + (i._bogoFreeAmount || 0), 0)
    );

    const bagPayable = round2(sellingTotal - bogoDiscount);



    const totalSavings = round2(
      bagMrp - bagPayable + discountFromCoupon
    );

    let grandTotal = round2(bagPayable - discountFromCoupon);

    // -------------------- Shipping --------------------
    const SHIPPING_CHARGE = 70;
    const FREE_SHIPPING_THRESHOLD = 499;

    let shippingCharge = 0;
    let shippingMessage = "";

    if (summary.freeShipping) {
      shippingCharge = 0;
      shippingMessage = "🚚 Free shipping via promotion!";
    } else if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
      shippingCharge = 0;
      shippingMessage = "🎉 Free shipping on your order!";
    } else {
      shippingCharge = SHIPPING_CHARGE;
      const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
      shippingMessage = `📦 Add ₹${amountToFree} more for free shipping!`;
    }

    // -------------------- GST Calculation --------------------
    const GST_RATE = 0.12; // 12%

    const taxableAmount = round2(bagPayable - discountFromCoupon + shippingCharge);

    const gstAmount = round2(grandTotal * GST_RATE);

    const payableWithGST = round2(taxableAmount + gstAmount);


    // Friendly message (frontend ready)
    const gstMessage = `🧾 Includes 12% GST (₹${gstAmount})`;


    // -------------------- Final Response --------------------
    const responseData = {
      cart: finalCart,
      // 👇👇 ADD THIS
      freebies: freebies.map(f => ({
        productId: f.productId,
        name: f.name || "",
        qty: f.qty || f.quantity || 1,
        variant: f.variant || null,
        price: 0,
        message: f.message || "Free item"
      })),
      priceDetails: {
        bagMrp,
        totalSavings,
        bagDiscount: round2(bagMrp - bagPayable),
        autoDiscount: round2(bagMrp - bagPayable),
        couponDiscount: round2(discountFromCoupon),
        shippingCharge: round2(shippingCharge),
        shippingMessage,
        taxableAmount,       // 🔥 important
        gstRate: "12%",
        gstAmount,
        gstMessage,
        payable: payableWithGST,
        promoFreeShipping: !!summary.freeShipping,
        savingsMessage:
          totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
      },
      appliedCoupon,
      appliedPromotions,

      // 👇 include raw freebies here too for debugging
      rawFreebies: freebies,
      applicableCoupons,
      inapplicableCoupons,
      grandTotal: payableWithGST,
      isGuest,
    };

    // Cache the final response (longer TTL)
    try {
      await redis.set(redisKey, JSON.stringify(responseData), "EX", CART_CACHE_TTL);
    } catch (err) {
      console.error("Redis set failed:", err);
    }


    return res.json(responseData);
  } catch (error) {
    console.error("❌ getCartSummary error:", error);
    return res.status(500).json({
      message: "Failed to get cart summary",
      error: error.message,
    });
  }
};
