
// // controllers/admin/promotionController.js
// import Promotion from "../models/Promotion.js";
// import Category from "../models/Category.js";
// import Product from "../models/Product.js";
// import Brand from "../models/Brand.js";
// import mongoose from "mongoose";
// import moment from "moment-timezone";
// import { promotionSchema } from "../middlewares/validations/promotionValidation.js";

// /* ---------- helpers ---------- */
// const isObjectId = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);

// const calculateStatus = (start, end) => {
//   const now = new Date();
//   if (now < new Date(start)) return "upcoming";
//   if (now > new Date(end)) return "expired";
//   return "active";
// };

// const parseISTtoUTC = (dateStr, label) => {
//   const parsedIST = moment.tz(dateStr, "YYYY-MM-DD HH:mm", "Asia/Kolkata");
//   if (!parsedIST.isValid()) {
//     throw new Error(`❌ Invalid ${label} format. Use YYYY-MM-DD HH:mm (IST)`);
//   }
//   return parsedIST.toDate(); // UTC Date
// };

// const resolveBrands = async (brands) => {
//   if (!brands?.length) return [];
//   const resolved = await Promise.all(
//     brands.map(async (b) => {
//       if (typeof b === "object" && b._id)
//         return { brand: b._id, slug: b.slug || "", customId: b._id.toString() };
//       if (typeof b === "object" && b.brand)
//         return { brand: b.brand, slug: b.slug || "", customId: b.brand.toString() };
//       if (typeof b === "string" && isObjectId(b)) {
//         const br = await Brand.findById(b).select("_id slug");
//         return br ? { brand: br._id, slug: br.slug, customId: br._id.toString() } : null;
//       }
//       if (typeof b === "string") {
//         const br = await Brand.findOne({ slug: b }).select("_id slug");
//         return br ? { brand: br._id, slug: br.slug, customId: br._id.toString() } : null;
//       }
//       return null;
//     })
//   );
//   return resolved.filter(Boolean);
// };

// const resolveCategories = async (categories) => {
//   if (!categories?.length) return [];
//   const resolved = await Promise.all(
//     categories.map(async (c) => {
//       if (typeof c === "object" && c._id)
//         return { category: c._id, slug: c.slug || "", customId: c._id.toString() };
//       if (typeof c === "object" && c.category)
//         return { category: c.category, slug: c.slug || "", customId: c.category.toString() };
//       if (typeof c === "string" && isObjectId(c)) {
//         const cat = await Category.findById(c).select("_id slug");
//         return cat ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() } : null;
//       }
//       if (typeof c === "string") {
//         const cat = await Category.findOne({ slug: c }).select("_id slug");
//         return cat ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() } : null;
//       }
//       return null;
//     })
//   );
//   return resolved.filter(Boolean);
// };

// // Validate & normalize promotion types
// // const normalizeByType = async (body) => {
// //   const { promotionType, promotionConfig = {}, discountUnit, discountValue } = body;

// //   switch (promotionType) {
// //     case "discount":
// //       if (!["percent", "amount"].includes(discountUnit))
// //         throw new Error("discountUnit must be 'percent' or 'amount'");
// //       if (!(discountValue > 0)) throw new Error("discountValue must be positive");
// //       return { promotionConfig: {} };

// //     case "tieredDiscount":
// //       const tiers = promotionConfig.tiers || [];
// //       if (!tiers.length) throw new Error("tieredDiscount requires non-empty tiers");
// //       tiers.forEach((t) => {
// //         if (!(t.minQty >= 1)) throw new Error("Each tier requires minQty >= 1");
// //         if (!(t.discountPercent > 0 && t.discountPercent <= 95))
// //           throw new Error("tier discountPercent must be 1..95");
// //       });
// //       return {
// //         promotionConfig: {
// //           tiers: tiers.sort((a, b) => a.minQty - b.minQty),
// //           tierScope: promotionConfig.tierScope === "perOrder" ? "perOrder" : "perProduct",
// //         },
// //       };
// //     case "bundle": {
// //       // fallback safe parsing
// //       const bundleProducts = Array.isArray(promotionConfig.bundleProducts)
// //         ? promotionConfig.bundleProducts.filter(isObjectId)
// //         : [];

// //       const bundlePrice = Number(promotionConfig.bundlePrice || 0);

// //       // ✅ Instead of throwing hard errors, just fallback gracefully
// //       return {
// //         promotionConfig: {
// //           bundleProducts,
// //           bundlePrice: bundlePrice > 0 ? bundlePrice : null, // allow null if not set
// //         },
// //       };
// //     }


// //     case "gift":
// //       const minOrderValue = Number(promotionConfig.minOrderValue || 0);
// //       if (!(minOrderValue > 0)) throw new Error("gift requires minOrderValue > 0");
// //       if (!isObjectId(promotionConfig.giftProductId || ""))
// //         throw new Error("gift requires valid giftProductId");
// //       return { promotionConfig: { minOrderValue, giftProductId: promotionConfig.giftProductId } };

// //     case "freeShipping":
// //       if (!(promotionConfig.minOrderValue > 0))
// //         throw new Error("freeShipping requires minOrderValue > 0");
// //       return { promotionConfig: { minOrderValue: promotionConfig.minOrderValue } };

// //     case "newUser":
// //       if (!(promotionConfig.discountPercent > 0 && promotionConfig.discountPercent <= 50))
// //         throw new Error("newUser discountPercent must be 1..50");
// //       if (!(promotionConfig.maxDiscount >= 0))
// //         throw new Error("newUser maxDiscount must be >= 0");
// //       return { promotionConfig };

// //     case "collection":
// //       if (!(promotionConfig.maxProductPrice > 0)) {
// //         throw new Error("collection requires maxProductPrice > 0");
// //       }
// //       return {
// //         promotionConfig: { maxProductPrice: promotionConfig.maxProductPrice }
// //       };

// //     case "paymentOffer":
// //       if (!promotionConfig.provider) throw new Error("paymentOffer requires provider");
// //       if (!Array.isArray(promotionConfig.methods) || !promotionConfig.methods.length)
// //         throw new Error("paymentOffer requires methods");
// //       return { promotionConfig };

// //     case "bogo":
// //       const cfg = {
// //         buyQty: Number(promotionConfig.buyQty || 1),
// //         getQty: Number(promotionConfig.getQty || 1),
// //         sameProduct: Boolean(promotionConfig.sameProduct),
// //         freeProductId: promotionConfig.freeProductId || null,
// //       };
// //       if (cfg.buyQty < 1 || cfg.getQty < 1)
// //         throw new Error("bogo requires buyQty>=1 and getQty>=1");
// //       if (!cfg.sameProduct && !isObjectId(cfg.freeProductId || ""))
// //         throw new Error("bogo with sameProduct=false requires valid freeProductId");
// //       return { promotionConfig: cfg };

// //     default:
// //       throw new Error("Unsupported promotionType");
// //   }
// // };



// // const normalizeByType = async (body) => {
// //   const { promotionType, promotionConfig = {}, discountUnit, discountValue } = body;

// //   switch (promotionType) {
// //     /* ------------------- FLAT DISCOUNT ------------------- */
// //     case "discount":
// //       if (!["percent", "amount"].includes(discountUnit))
// //         throw new Error("discountUnit must be 'percent' or 'amount'");
// //       if (!(discountValue > 0))
// //         throw new Error("discountValue must be positive");
// //       return { promotionConfig: {} };

// //     /* ------------------- TIERED DISCOUNT ------------------- */
// //     case "tieredDiscount": {
// //       const tiers = promotionConfig.tiers || [];
// //       if (!tiers.length) throw new Error("tieredDiscount requires non-empty tiers");

// //       tiers.forEach((t) => {
// //         if (!(t.minQty >= 1)) throw new Error("Each tier requires minQty >= 1");
// //         if (!(t.discountPercent > 0 && t.discountPercent <= 95))
// //           throw new Error("tier discountPercent must be 1..95");
// //       });

// //       return {
// //         promotionConfig: {
// //           tiers: tiers.sort((a, b) => a.minQty - b.minQty),
// //           tierScope: promotionConfig.tierScope === "perOrder" ? "perOrder" : "perProduct",
// //         },
// //       };
// //     }

// //     /* ------------------- BUNDLE DEAL ------------------- */
// //     case "bundle": {
// //       // ✅ Soft validation + graceful fallback
// //       const bundleProducts = Array.isArray(promotionConfig.bundleProducts)
// //         ? promotionConfig.bundleProducts.filter(isObjectId)
// //         : [];

// //       const bundlePrice = Number(promotionConfig.bundlePrice || 0);

// //       // ⚠️ Do not throw if admin misses one field — just sanitize
// //       return {
// //         promotionConfig: {
// //           bundleProducts,
// //           bundlePrice: bundlePrice > 0 ? bundlePrice : null, // null means not active yet
// //         },
// //       };
// //     }

// //     /* ------------------- GIFT PROMO ------------------- */
// //     case "gift": {
// //       const minOrderValue = Number(promotionConfig.minOrderValue || 0);
// //       const giftProductId = promotionConfig.giftProductId;

// //       if (!(minOrderValue > 0))
// //         throw new Error("gift requires minOrderValue > 0");
// //       if (!isObjectId(giftProductId || ""))
// //         throw new Error("gift requires valid giftProductId");

// //       return { promotionConfig: { minOrderValue, giftProductId } };
// //     }

// //     /* ------------------- FREE SHIPPING ------------------- */
// //     case "freeShipping": {
// //       const minOrderValue = Number(promotionConfig.minOrderValue || 0);
// //       if (!(minOrderValue > 0))
// //         throw new Error("freeShipping requires minOrderValue > 0");
// //       return { promotionConfig: { minOrderValue } };
// //     }

// //     /* ------------------- NEW USER OFFER ------------------- */
// //     case "newUser": {
// //       const dp = Number(promotionConfig.discountPercent || 0);
// //       const cap = Number(promotionConfig.maxDiscount || 0);

// //       if (!(dp > 0 && dp <= 50))
// //         throw new Error("newUser discountPercent must be between 1–50");
// //       if (cap < 0)
// //         throw new Error("newUser maxDiscount must be >= 0");

// //       return { promotionConfig: { discountPercent: dp, maxDiscount: cap } };
// //     }

// //     /* ------------------- COLLECTION OFFER ------------------- */
// //     case "collection": {
// //       const maxProductPrice = Number(promotionConfig.maxProductPrice || 0);
// //       if (!(maxProductPrice > 0))
// //         throw new Error("collection requires maxProductPrice > 0");

// //       return { promotionConfig: { maxProductPrice } };
// //     }

// //     /* ------------------- PAYMENT OFFER ------------------- */
// //     case "paymentOffer": {
// //       const provider = (promotionConfig.provider || "").trim();
// //       const methods = Array.isArray(promotionConfig.methods)
// //         ? promotionConfig.methods.filter(Boolean)
// //         : [];

// //       if (!provider)
// //         throw new Error("paymentOffer requires provider");
// //       if (!methods.length)
// //         throw new Error("paymentOffer requires at least one payment method");

// //       return { promotionConfig: { provider, methods } };
// //     }

// //     /* ------------------- BUY ONE GET ONE (BOGO) ------------------- */
// //     case "bogo": {
// //       const cfg = {
// //         buyQty: Number(promotionConfig.buyQty || 1),
// //         getQty: Number(promotionConfig.getQty || 1),
// //         sameProduct:
// //           promotionConfig.sameProduct === true ||
// //           promotionConfig.sameProduct === "true" ||
// //           promotionConfig.sameProduct === 1,
// //         freeProductId: promotionConfig.freeProductId || null,
// //       };

// //       if (cfg.buyQty < 1 || cfg.getQty < 1)
// //         throw new Error("bogo requires buyQty>=1 and getQty>=1");

// //       if (!cfg.sameProduct && !isObjectId(cfg.freeProductId || ""))
// //         throw new Error("bogo with sameProduct=false requires valid freeProductId");

// //       return { promotionConfig: cfg };
// //     }

// //     /* ------------------- UNSUPPORTED ------------------- */
// //     default:
// //       throw new Error(`Unsupported promotionType: ${promotionType}`);
// //   }
// // };



// const normalizeByType = async (body) => {
//   const { promotionType, promotionConfig = {}, discountUnit, discountValue } = body;

//   const invalid = (msg) => { throw new Error(msg); };

//   switch (promotionType) {
//     case "discount":
//       if (!["percent", "amount"].includes(discountUnit))
//         invalid("discountUnit must be 'percent' or 'amount'");
//       if (!(discountValue > 0)) invalid("discountValue must be positive");
//       return {};

//     case "tieredDiscount": {
//       const tiers = promotionConfig.tiers || [];
//       if (!tiers.length) invalid("tieredDiscount requires non-empty tiers");

//       tiers.forEach((t) => {
//         if (!(Number(t.minQty) >= 1)) invalid("Each tier requires minQty >= 1");
//         if (!(t.discountPercent > 0 && t.discountPercent <= 95))
//           invalid("tier discountPercent must be 1..95");
//       });

//       return {
//         tiers: tiers
//           .map(t => ({
//             minQty: Number(t.minQty),
//             discountPercent: Number(t.discountPercent),
//             extraPercent: Number(t.extraPercent || 0)
//           }))
//           .sort((a, b) => a.minQty - b.minQty),
//         tierScope: promotionConfig.tierScope === "perOrder" ? "perOrder" : "perProduct",
//       };
//     }

//     case "bundle": {
//       const bundleProducts = Array.isArray(promotionConfig.bundleProducts)
//         ? promotionConfig.bundleProducts.filter(isObjectId).map(String)
//         : [];
//       const bundlePrice = Number(promotionConfig.bundlePrice || 0);
//       return { bundleProducts, bundlePrice: bundlePrice > 0 ? bundlePrice : null };
//     }

//     case "gift": {
//       const minOrderValue = Number(promotionConfig.minOrderValue || 0);
//       const giftProductId = promotionConfig.giftProductId || promotionConfig.giftProduct;
//       if (!(minOrderValue > 0)) invalid("gift requires minOrderValue > 0");
//       if (!isObjectId(giftProductId || "")) invalid("gift requires valid giftProductId");
//       return { minOrderValue, giftProductId: String(giftProductId) };
//     }

//     case "freeShipping": {
//       const minOrderValue = Number(promotionConfig.minOrderValue || 0);
//       if (!(minOrderValue > 0)) invalid("freeShipping requires minOrderValue > 0");
//       return { minOrderValue };
//     }

//     case "newUser": {
//       const dp = Number(promotionConfig.discountPercent || 0);
//       const cap = Number(promotionConfig.maxDiscount || 0);
//       if (!(dp > 0 && dp <= 50)) invalid("newUser discountPercent must be between 1–50");
//       if (cap < 0) invalid("newUser maxDiscount must be >= 0");
//       return { discountPercent: dp, maxDiscount: cap };
//     }

//     case "collection": {
//       const maxProductPrice = Number(promotionConfig.maxProductPrice || 0);
//       if (!(maxProductPrice > 0)) invalid("collection requires maxProductPrice > 0");
//       return { maxProductPrice };
//     }

//     case "paymentOffer": {
//       const provider = (promotionConfig.provider || "").trim();
//       const methods = Array.isArray(promotionConfig.methods)
//         ? promotionConfig.methods.filter(Boolean)
//         : [];
//       if (!provider) invalid("paymentOffer requires provider");
//       if (!methods.length) invalid("paymentOffer requires at least one payment method");
//       return { provider, methods };
//     }

//     // ✅ FIXED: Removed forced validation for BOGO
//     case "bogo": {
//       return {
//         buyQty: Number(promotionConfig.buyQty || 1),
//         getQty: Number(promotionConfig.getQty || 1),
//         sameProduct: !!promotionConfig.sameProduct,
//         freeProductId: promotionConfig.freeProductId || null,
//       };
//     }

//     default:
//       invalid(`Unsupported promotionType: ${promotionType}`);
//   }
// };

// const ALLOWED_SECTIONS = ["banner", "product", "offers"];

// // const createPromotion = async (req, res) => {
// //   try {
// //     // ✅ Step 1: Joi validation
// //     const { error, value } = promotionSchema.validate(req.body, { abortEarly: false });
// //     if (error) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "❌ Validation failed",
// //         errors: error.details.map(e => e.message),
// //       });
// //     }

// //     // Destructure after Joi validation
// //     const { startDate, endDate, displaySection } = value;

// //     if (!startDate || !endDate) {
// //       return res.status(400).json({ message: "❌ startDate and endDate are required" });
// //     }

// //     // ✅ Step 2: Convert IST → UTC
// //     const startDateUTC = parseISTtoUTC(startDate, "startDate");
// //     const endDateUTC = parseISTtoUTC(endDate, "endDate");

// //     if (endDateUTC <= startDateUTC) {
// //       return res.status(400).json({ message: "❌ endDate must be after startDate" });
// //     }

// //     // ✅ Step 3: Parse display sections
// //     let sections = [];
// //     if (typeof displaySection === "string") {
// //       sections = displaySection.split(",").map(s => s.trim().toLowerCase());
// //     } else if (Array.isArray(displaySection)) {
// //       sections = displaySection.map(s => s.trim().toLowerCase());
// //     }

// //     sections = sections.filter(s => ALLOWED_SECTIONS.includes(s));
// //     if (sections.length === 0) {
// //       return res.status(400).json({
// //         message: `❌ At least one valid display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
// //       });
// //     }

// //     // ✅ Step 4: Normalize categories & brands
// //     const categoriesInput = value.categories
// //       ? Array.isArray(value.categories)
// //         ? value.categories
// //         : [value.categories]
// //       : [];

// //     // ✅ Ensure we only store ObjectIds (clean, consistent)
// //     const resolvedCategories = await resolveCategories(categoriesInput);
// //     const categories = resolvedCategories
// //       .map(c => (typeof c === "object" && c._id ? c._id : c))
// //       .filter(isObjectId)
// //       .map(id => id.toString());

// //     const brandsInput = value.brands
// //       ? Array.isArray(value.brands)
// //         ? value.brands
// //         : [value.brands]
// //       : [];
// //     const resolvedBrands = await resolveBrands(brandsInput);
// //     const brands = resolvedBrands
// //       .map(b => (typeof b === "object" && b._id ? b._id : b))
// //       .filter(isObjectId)
// //       .map(id => id.toString());

// //     // ✅ Step 5: Collect images (from req.files or body)
// //     const images = [
// //       ...(req.files?.map(f => f.path) || []),
// //       ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
// //       ...(req.body.image ? [req.body.image] : []),
// //     ];

// //     // ✅ Step 6: Normalize promotionConfig based on type
// //     const promotionConfig = await normalizeByType(value);

// //     // ✅ Step 7: Calculate status (active / upcoming / expired)
// //     const status = calculateStatus(startDateUTC, endDateUTC);
// //     const isScheduled = status === "upcoming";

// //     // ✅ Step 8: Create promotion
// //     const promotion = await Promotion.create({
// //       ...value,
// //       categories,
// //       brands,
// //       images,
// //       promotionConfig,           // now a plain object
// //       startDate: startDateUTC,
// //       endDate: endDateUTC,
// //       status,
// //       isScheduled,
// //       displaySection: sections,
// //     });

// //     res.status(201).json({
// //       success: true,
// //       message: "✅ Promotion created successfully",
// //       promotion,
// //     });
// //   } catch (err) {
// //     console.error("❌ Create Promotion Error:", err);
// //     res.status(400).json({
// //       success: false,
// //       message: "❌ Failed to create promotion",
// //       error: err.message,
// //     });
// //   }
// // };

// const createPromotion = async (req, res) => {
//   try {
//     // ✅ Step 1: Extract body directly (no Joi validation)
//     const value = req.body;
//     const { startDate, endDate, displaySection } = value;

//     // ✅ Step 2: Basic date validation
//     if (!startDate || !endDate) {
//       return res.status(400).json({ message: "❌ startDate and endDate are required" });
//     }

//     const startDateUTC = parseISTtoUTC(startDate, "startDate");
//     const endDateUTC = parseISTtoUTC(endDate, "endDate");

//     if (endDateUTC <= startDateUTC) {
//       return res.status(400).json({ message: "❌ endDate must be after startDate" });
//     }

//     // ✅ Step 3: Parse display sections
//     let sections = [];
//     if (typeof displaySection === "string") {
//       sections = displaySection.split(",").map(s => s.trim().toLowerCase());
//     } else if (Array.isArray(displaySection)) {
//       sections = displaySection.map(s => s.trim().toLowerCase());
//     }

//     sections = sections.filter(s => ALLOWED_SECTIONS.includes(s));
//     if (sections.length === 0) {
//       return res.status(400).json({
//         message: `❌ At least one valid display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
//       });
//     }

//     // ✅ Step 4: Normalize categories & brands
//     const categoriesInput = value.categories
//       ? Array.isArray(value.categories)
//         ? value.categories
//         : [value.categories]
//       : [];

//     const resolvedCategories = await resolveCategories(categoriesInput);
//     const categories = resolvedCategories
//       .map(c => (typeof c === "object" && c._id ? c._id : c))
//       .filter(isObjectId)
//       .map(id => id.toString());

//     const brandsInput = value.brands
//       ? Array.isArray(value.brands)
//         ? value.brands
//         : [value.brands]
//       : [];

//     const resolvedBrands = await resolveBrands(brandsInput);
//     const brands = resolvedBrands
//       .map(b => (typeof b === "object" && b._id ? b._id : b))
//       .filter(isObjectId)
//       .map(id => id.toString());

//     // ✅ Step 5: Collect images
//     const images = [
//       ...(req.files?.map(f => f.path) || []),
//       ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
//       ...(req.body.image ? [req.body.image] : []),
//     ];

//     // ✅ Step 6: Normalize promotionConfig (light logic)
//     const promotionConfig = await normalizeByType(value);

//     // ✅ Step 7: Calculate status (active / upcoming / expired)
//     const status = calculateStatus(startDateUTC, endDateUTC);
//     const isScheduled = status === "upcoming";

//     // ✅ Step 8: Create promotion
//     const promotion = await Promotion.create({
//       ...value,
//       categories,
//       brands,
//       images,
//       promotionConfig,
//       startDate: startDateUTC,
//       endDate: endDateUTC,
//       status,
//       isScheduled,
//       displaySection: sections,
//     });

//     // ✅ Step 9: Return
//     res.status(201).json({
//       success: true,
//       message: "✅ Promotion created successfully",
//       promotion,
//     });
//   } catch (err) {
//     console.error("❌ Create Promotion Error:", err);
//     res.status(400).json({
//       success: false,
//       message: "❌ Failed to create promotion",
//       error: err.message,
//     });
//   }
// };



// // const createPromotion = async (req, res) => {
// //   try {

// //     const { startDate, endDate, displaySection } = req.body;

// //     if (!startDate || !endDate) {
// //       return res.status(400).json({ message: "❌ startDate and endDate are required" });
// //     }

// //     // Parse IST → UTC
// //     const startDateUTC = parseISTtoUTC(startDate, "startDate");
// //     const endDateUTC = parseISTtoUTC(endDate, "endDate");

// //     if (endDateUTC <= startDateUTC) {
// //       return res.status(400).json({ message: "❌ endDate must be after startDate" });
// //     }

// //     // Parse and validate displaySection
// //     if (!displaySection) {
// //       return res.status(400).json({
// //         message: `❌ At least one display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
// //       });
// //     }

// //     let sections = [];
// //     if (typeof displaySection === "string") {
// //       sections = displaySection.split(",").map((s) => s.trim().toLowerCase());
// //     } else if (Array.isArray(displaySection)) {
// //       sections = displaySection.map((s) => s.trim().toLowerCase());
// //     }

// //     // Keep only valid sections
// //     sections = sections.filter((s) => ALLOWED_SECTIONS.includes(s));
// //     if (sections.length === 0) {
// //       return res.status(400).json({
// //         message: `❌ At least one valid display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
// //       });
// //     }

// //     // ✅ Normalize categories and brands to arrays
// //     const categoriesInput = req.body.categories
// //       ? Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories]
// //       : [];
// //     const categories = await resolveCategories(categoriesInput);

// //     const brandsInput = req.body.brands
// //       ? Array.isArray(req.body.brands) ? req.body.brands : [req.body.brands]
// //       : [];
// //     const brands = await resolveBrands(brandsInput);

// //     const images = [
// //       ...(req.files?.map((f) => f.path) || []),
// //       ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
// //       ...(req.body.image ? [req.body.image] : []),
// //     ];

// //     const { promotionConfig } = await normalizeByType(req.body);

// //     const status = calculateStatus(startDateUTC, endDateUTC);
// //     const isScheduled = status === "upcoming";

// //     const promotion = await Promotion.create({
// //       ...req.body,
// //       categories,
// //       brands,
// //       images,
// //       promotionConfig,
// //       startDate: startDateUTC,
// //       endDate: endDateUTC,
// //       status,
// //       isScheduled,
// //       displaySection: sections,
// //     });

// //     res.status(201).json({ message: "✅ Promotion created", id: promotion._id, promotion });
// //   } catch (err) {
// //     res.status(400).json({ message: "❌ Failed to create promotion", error: err.message });
// //   }
// // };

// const getPromotionById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const promotion = await Promotion.findById(id)
//       .populate("categories.category brands.brand", "name slug");

//     if (!promotion) {
//       return res.status(404).json({ message: "Promotion not found" });
//     }

//     res.status(200).json({
//       id: promotion._id, // ✅ MongoDB ObjectId as `id`
//       _id: promotion._id,
//       campaignName: promotion.campaignName,
//       description: promotion.description,
//       promotionType: promotion.promotionType,
//       status: promotion.status,
//       startDate: promotion.startDate,
//       endDate: promotion.endDate,
//       targetAudience: promotion.targetAudience,
//       images: promotion.images || [],
//       brands: promotion.brands.map((b) => ({
//         id: b.brand?._id,
//         slug: b.slug || b.brand?.slug,
//         name: b.brand?.name,
//       })),
//       categories: promotion.categories.map((c) => ({
//         id: c.category?._id,
//         slug: c.slug || c.category?.slug,
//         name: c.category?.name,
//       })),
//       promotionConfig: promotion.promotionConfig,
//       isScheduled: promotion.isScheduled,
//       discountUnit: promotion.discountUnit,
//       discountValue: promotion.discountValue,
//       tags: promotion.tags || [],
//       scope: promotion.scope,
//       products: promotion.products || [],
//       promoCodes: promotion.promoCodes || [],
//       conversions: promotion.conversions,
//       countdown: promotion.countdown,
//       createdAt: promotion.createdAt,
//       updatedAt: promotion.updatedAt,
//     });

//   } catch (err) {
//     res.status(500).json({
//       message: "Failed to fetch promotion",
//       error: err.message,
//     });
//   }
// };

// const updatePromotion = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const existing = await Promotion.findById(id);
//     if (!existing) return res.status(404).json({ message: "Promotion not found" });

//     // Handle displaySection if passed
//     let displaySection = existing.displaySection;
//     if (req.body.displaySection) {
//       let sections = [];
//       if (typeof req.body.displaySection === "string") {
//         sections = req.body.displaySection.split(",").map((s) => s.trim().toLowerCase());
//       } else if (Array.isArray(req.body.displaySection)) {
//         sections = req.body.displaySection.map((s) => s.trim().toLowerCase());
//       }

//       // Keep only valid sections
//       sections = sections.filter((s) => ALLOWED_SECTIONS.includes(s));
//       if (sections.length === 0) {
//         return res.status(400).json({
//           message: `❌ At least one valid display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
//         });
//       }

//       displaySection = sections;
//     }

//     const status = calculateStatus(req.body.startDate || existing.startDate, req.body.endDate || existing.endDate);

//     // Normalize categories & brands
//     const categories = req.body.categories
//       ? await resolveCategories(Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories])
//       : undefined;

//     const brands = req.body.brands
//       ? await resolveBrands(Array.isArray(req.body.brands) ? req.body.brands : [req.body.brands])
//       : undefined;

//     // Collect new images
//     const incomingImages = [
//       ...(req.files?.map((f) => f.path) || []),
//       ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
//       ...(req.body.image ? [req.body.image] : []),
//     ];

//     let normalizedConfig = existing.promotionConfig;
//     if (req.body.promotionConfig || req.body.promotionType) {
//       const { promotionConfig } = await normalizeByType({
//         promotionType: req.body.promotionType || existing.promotionType,
//         promotionConfig: req.body.promotionConfig || existing.promotionConfig,
//         discountUnit: req.body.discountUnit || existing.discountUnit,
//         discountValue: req.body.discountValue || existing.discountValue,
//       });
//       normalizedConfig = promotionConfig;
//     }

//     const updateData = {
//       ...req.body,
//       status,
//       ...(categories !== undefined && { categories }),
//       ...(brands !== undefined && { brands }),
//       // ✅ Replace old images with new ones if uploaded
//       images: incomingImages.length ? incomingImages : existing.images,
//       promotionConfig: normalizedConfig,
//       displaySection,
//     };

//     if (!req.body.promotionType) updateData.promotionType = existing.promotionType;

//     const promotion = await Promotion.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

//     res.status(200).json({ message: "Promotion updated", id: promotion._id, promotion });
//   } catch (err) {
//     res.status(400).json({ message: "Failed to update promotion", error: err.message });
//   }
// };

// // ✅ Delete Promotion
// const deletePromotion = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const promotion = await Promotion.findByIdAndDelete(id);
//     if (!promotion)
//       return res.status(404).json({ message: "Promotion not found" });
//     res.status(200).json({
//       message: "Promotion deleted successfully",
//       id: promotion._id  // ✅ added
//     });
//   } catch (err) {
//     res
//       .status(500)
//       .json({ message: "Failed to delete promotion", error: err.message });
//   }
// };

// // ✅ Get Promotion Summary
// const getPromotionSummary = async (req, res) => {
//   try {
//     const query = {};
//     if (req.query.status) query.status = req.query.status;

//     const promotions = await Promotion.find(query)
//       .select(
//         "campaignName targetAudience status promotionType startDate endDate categories images"
//       )
//       .populate("categories.category brands.brand", "name slug");

//     const summary = promotions.map((p) => ({
//       id: p._id,  // ✅ added
//       name: p.campaignName,
//       audience: p.targetAudience,
//       status: p.status,
//       type: p.promotionType,
//       duration: `${p.startDate.toISOString().split("T")[0]} to ${p.endDate.toISOString().split("T")[0]}`,
//       images: p.images || [],
//       brands: p.brands.map((b) => ({
//         id: b.brand?._id,
//         slug: b.slug || b.brand?.slug,
//         name: b.brand?.name,
//       })),
//       categories: p.categories.map((c) => ({
//         id: c.category?._id,
//         slug: c.slug || c.category?.slug,
//         name: c.category?.name,
//       })),
//       countdown: p.countdown,
//     }));
//     res.status(200).json(summary);
//   } catch (err) {
//     res
//       .status(500)
//       .json({ message: "Failed to fetch summary", error: err.message });
//   }
// };

// // ✅ Get Promotion List
// const getPromotionList = async (req, res) => {
//   try {
//     const promotions = await Promotion.find()
//       .select(
//         "campaignName promotionType startDate endDate status targetAudience categories images"
//       )
//       .populate("categories.category brands.brand", "name slug");

//     const list = promotions.map((p) => ({
//       id: p._id,  // ✅ added
//       name: p.campaignName,
//       type: p.promotionType,
//       startDate: p.startDate.toISOString().split("T")[0],
//       endDate: p.endDate.toISOString().split("T")[0],
//       status: p.status,
//       targetGroup: p.targetAudience,
//       images: p.images || [],
//       brands: p.brands.map((b) => ({
//         id: b.brand?._id,
//         slug: b.slug || b.brand?.slug,
//         name: b.brand?.name,
//       })),
//       categories: p.categories.map((c) => ({
//         id: c.category?._id,
//         slug: c.slug || c.category?.slug,
//         name: c.category?.name,
//       })),
//       countdown: p.countdown,
//     }));
//     res.status(200).json(list);
//   } catch (err) {
//     res
//       .status(500)
//       .json({ message: "Failed to fetch promotion list", error: err.message });
//   }
// };

// export {
//   createPromotion,
//   getPromotionById,
//   updatePromotion,
//   deletePromotion,
//   getPromotionSummary,
//   getPromotionList,

// };




// controllers/admin/promotionController.js
import Promotion from "../models/Promotion.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import Brand from "../models/Brand.js";
import mongoose from "mongoose";
import moment from "moment-timezone";


/* ---------- helpers ---------- */
const isObjectId = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);

const calculateStatus = (start, end) => {
  const now = new Date();
  if (now < new Date(start)) return "upcoming";
  if (now > new Date(end)) return "expired";
  return "active";
};

const parseISTtoUTC = (dateStr, label) => {
  const parsedIST = moment.tz(dateStr, "YYYY-MM-DD HH:mm", "Asia/Kolkata");
  if (!parsedIST.isValid()) {
    throw new Error(`❌ Invalid ${label} format. Use YYYY-MM-DD HH:mm (IST)`);
  }
  return parsedIST.toDate(); // UTC Date
};

const resolveBrands = async (brands) => {
  if (!brands?.length) return [];
  const resolved = await Promise.all(
    brands.map(async (b) => {
      if (typeof b === "object" && b._id)
        return { brand: b._id, slug: b.slug || "", customId: b._id.toString() };
      if (typeof b === "object" && b.brand)
        return { brand: b.brand, slug: b.slug || "", customId: b.brand.toString() };
      if (typeof b === "string" && isObjectId(b)) {
        const br = await Brand.findById(b).select("_id slug");
        return br ? { brand: br._id, slug: br.slug, customId: br._id.toString() } : null;
      }
      if (typeof b === "string") {
        const br = await Brand.findOne({ slug: b }).select("_id slug");
        return br ? { brand: br._id, slug: br.slug, customId: br._id.toString() } : null;
      }
      return null;
    })
  );
  return resolved.filter(Boolean);
};

const resolveCategories = async (categories) => {
  if (!categories?.length) return [];
  const resolved = await Promise.all(
    categories.map(async (c) => {
      if (typeof c === "object" && c._id)
        return { category: c._id, slug: c.slug || "", customId: c._id.toString() };
      if (typeof c === "object" && c.category)
        return { category: c.category, slug: c.slug || "", customId: c.category.toString() };
      if (typeof c === "string" && isObjectId(c)) {
        const cat = await Category.findById(c).select("_id slug");
        return cat ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() } : null;
      }
      if (typeof c === "string") {
        const cat = await Category.findOne({ slug: c }).select("_id slug");
        return cat ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() } : null;
      }
      return null;
    })
  );
  return resolved.filter(Boolean);
};

// Validate & normalize promotion types
const normalizeByType = async (body) => {
  const { promotionType, promotionConfig = {}, discountUnit, discountValue } = body;

  switch (promotionType) {
    case "discount":
      if (!["percent", "amount"].includes(discountUnit))
        throw new Error("discountUnit must be 'percent' or 'amount'");
      if (!(discountValue > 0)) throw new Error("discountValue must be positive");
      return { promotionConfig: {} };

    case "tieredDiscount":
      const tiers = promotionConfig.tiers || [];
      if (!tiers.length) throw new Error("tieredDiscount requires non-empty tiers");
      tiers.forEach((t) => {
        if (!(t.minQty >= 1)) throw new Error("Each tier requires minQty >= 1");
        if (!(t.discountPercent > 0 && t.discountPercent <= 95))
          throw new Error("tier discountPercent must be 1..95");
      });
      return {
        promotionConfig: {
          tiers: tiers.sort((a, b) => a.minQty - b.minQty),
          tierScope: promotionConfig.tierScope === "perOrder" ? "perOrder" : "perProduct",
        },
      };
    case "bundle": {
      // fallback safe parsing
      const bundleProducts = Array.isArray(promotionConfig.bundleProducts)
        ? promotionConfig.bundleProducts.filter(isObjectId)
        : [];

      const bundlePrice = Number(promotionConfig.bundlePrice || 0);

      // ✅ Instead of throwing hard errors, just fallback gracefully
      return {
        promotionConfig: {
          bundleProducts,
          bundlePrice: bundlePrice > 0 ? bundlePrice : null, // allow null if not set
        },
      };
    }


    case "gift":
      const minOrderValue = Number(promotionConfig.minOrderValue || 0);
      if (!(minOrderValue > 0)) throw new Error("gift requires minOrderValue > 0");
      if (!isObjectId(promotionConfig.giftProductId || ""))
        throw new Error("gift requires valid giftProductId");
      return { promotionConfig: { minOrderValue, giftProductId: promotionConfig.giftProductId } };

    case "freeShipping":
      if (!(promotionConfig.minOrderValue > 0))
        throw new Error("freeShipping requires minOrderValue > 0");
      return { promotionConfig: { minOrderValue: promotionConfig.minOrderValue } };

    case "newUser":
      if (!(promotionConfig.discountPercent > 0 && promotionConfig.discountPercent <= 50))
        throw new Error("newUser discountPercent must be 1..50");
      if (!(promotionConfig.maxDiscount >= 0))
        throw new Error("newUser maxDiscount must be >= 0");
      return { promotionConfig };

    case "collection":
      if (!(promotionConfig.maxProductPrice > 0)) {
        throw new Error("collection requires maxProductPrice > 0");
      }
      return {
        promotionConfig: { maxProductPrice: promotionConfig.maxProductPrice }
      };

    case "paymentOffer":
      if (!promotionConfig.provider) throw new Error("paymentOffer requires provider");
      if (!Array.isArray(promotionConfig.methods) || !promotionConfig.methods.length)
        throw new Error("paymentOffer requires methods");
      return { promotionConfig };

    case "bogo":
      const cfg = {
        buyQty: Number(promotionConfig.buyQty || 1),
        getQty: Number(promotionConfig.getQty || 1),
        sameProduct: Boolean(promotionConfig.sameProduct),
        freeProductId: promotionConfig.freeProductId || null,
      };
      if (cfg.buyQty < 1 || cfg.getQty < 1)
        throw new Error("bogo requires buyQty>=1 and getQty>=1");
      if (!cfg.sameProduct && !isObjectId(cfg.freeProductId || ""))
        throw new Error("bogo with sameProduct=false requires valid freeProductId");
      return { promotionConfig: cfg };

    default:
      throw new Error("Unsupported promotionType");
  }
};

/* ---------- controllers ---------- */

const ALLOWED_SECTIONS = ["banner", "product", "offers"];

const createPromotion = async (req, res) => {
  try {
    const { startDate, endDate, displaySection } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "❌ startDate and endDate are required" });
    }

    // Parse IST → UTC
    const startDateUTC = parseISTtoUTC(startDate, "startDate");
    const endDateUTC = parseISTtoUTC(endDate, "endDate");

    if (endDateUTC <= startDateUTC) {
      return res.status(400).json({ message: "❌ endDate must be after startDate" });
    }

    // Parse and validate displaySection
    if (!displaySection) {
      return res.status(400).json({
        message: `❌ At least one display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
      });
    }

    let sections = [];
    if (typeof displaySection === "string") {
      sections = displaySection.split(",").map((s) => s.trim().toLowerCase());
    } else if (Array.isArray(displaySection)) {
      sections = displaySection.map((s) => s.trim().toLowerCase());
    }

    // Keep only valid sections
    sections = sections.filter((s) => ALLOWED_SECTIONS.includes(s));
    if (sections.length === 0) {
      return res.status(400).json({
        message: `❌ At least one valid display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
      });
    }

    // ✅ Normalize categories and brands to arrays
    const categoriesInput = req.body.categories
      ? Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories]
      : [];
    const categories = await resolveCategories(categoriesInput);

    const brandsInput = req.body.brands
      ? Array.isArray(req.body.brands) ? req.body.brands : [req.body.brands]
      : [];
    const brands = await resolveBrands(brandsInput);

    const images = [
      ...(req.files?.map((f) => f.path) || []),
      ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
      ...(req.body.image ? [req.body.image] : []),
    ];

    const { promotionConfig } = await normalizeByType(req.body);

    const status = calculateStatus(startDateUTC, endDateUTC);
    const isScheduled = status === "upcoming";

    const promotion = await Promotion.create({
      ...req.body,
      categories,
      brands,
      images,
      promotionConfig,
      startDate: startDateUTC,
      endDate: endDateUTC,
      status,
      isScheduled,
      displaySection: sections,
    });

    res.status(201).json({ message: "✅ Promotion created", id: promotion._id, promotion });
  } catch (err) {
    res.status(400).json({ message: "❌ Failed to create promotion", error: err.message });
  }
};

const getPromotionById = async (req, res) => {
  try {
    const { id } = req.params;

    const promotion = await Promotion.findById(id)
      .populate("categories.category brands.brand", "name slug");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    res.status(200).json({
      id: promotion._id, // ✅ MongoDB ObjectId as `id`
      _id: promotion._id,
      campaignName: promotion.campaignName,
      description: promotion.description,
      promotionType: promotion.promotionType,
      status: promotion.status,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      targetAudience: promotion.targetAudience,
      images: promotion.images || [],
      brands: promotion.brands.map((b) => ({
        id: b.brand?._id,
        slug: b.slug || b.brand?.slug,
        name: b.brand?.name,
      })),
      categories: promotion.categories.map((c) => ({
        id: c.category?._id,
        slug: c.slug || c.category?.slug,
        name: c.category?.name,
      })),
      promotionConfig: promotion.promotionConfig,
      isScheduled: promotion.isScheduled,
      discountUnit: promotion.discountUnit,
      discountValue: promotion.discountValue,
      tags: promotion.tags || [],
      scope: promotion.scope,
      products: promotion.products || [],
      promoCodes: promotion.promoCodes || [],
      conversions: promotion.conversions,
      countdown: promotion.countdown,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
    });

  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch promotion",
      error: err.message,
    });
  }
};

const updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Promotion.findById(id);
    if (!existing) return res.status(404).json({ message: "Promotion not found" });

    // Handle displaySection if passed
    let displaySection = existing.displaySection;
    if (req.body.displaySection) {
      let sections = [];
      if (typeof req.body.displaySection === "string") {
        sections = req.body.displaySection.split(",").map((s) => s.trim().toLowerCase());
      } else if (Array.isArray(req.body.displaySection)) {
        sections = req.body.displaySection.map((s) => s.trim().toLowerCase());
      }

      // Keep only valid sections
      sections = sections.filter((s) => ALLOWED_SECTIONS.includes(s));
      if (sections.length === 0) {
        return res.status(400).json({
          message: `❌ At least one valid display section must be selected (${ALLOWED_SECTIONS.join(", ")})`,
        });
      }

      displaySection = sections;
    }

    const status = calculateStatus(req.body.startDate || existing.startDate, req.body.endDate || existing.endDate);

    // Normalize categories & brands
    const categories = req.body.categories
      ? await resolveCategories(Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories])
      : undefined;

    const brands = req.body.brands
      ? await resolveBrands(Array.isArray(req.body.brands) ? req.body.brands : [req.body.brands])
      : undefined;

    // Collect new images
    const incomingImages = [
      ...(req.files?.map((f) => f.path) || []),
      ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
      ...(req.body.image ? [req.body.image] : []),
    ];

    let normalizedConfig = existing.promotionConfig;
    if (req.body.promotionConfig || req.body.promotionType) {
      const { promotionConfig } = await normalizeByType({
        promotionType: req.body.promotionType || existing.promotionType,
        promotionConfig: req.body.promotionConfig || existing.promotionConfig,
        discountUnit: req.body.discountUnit || existing.discountUnit,
        discountValue: req.body.discountValue || existing.discountValue,
      });
      normalizedConfig = promotionConfig;
    }

    const updateData = {
      ...req.body,
      status,
      ...(categories !== undefined && { categories }),
      ...(brands !== undefined && { brands }),
      // ✅ Replace old images with new ones if uploaded
      images: incomingImages.length ? incomingImages : existing.images,
      promotionConfig: normalizedConfig,
      displaySection,
    };

    if (!req.body.promotionType) updateData.promotionType = existing.promotionType;

    const promotion = await Promotion.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    res.status(200).json({ message: "Promotion updated", id: promotion._id, promotion });
  } catch (err) {
    res.status(400).json({ message: "Failed to update promotion", error: err.message });
  }
};

// ✅ Delete Promotion
const deletePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const promotion = await Promotion.findByIdAndDelete(id);
    if (!promotion)
      return res.status(404).json({ message: "Promotion not found" });
    res.status(200).json({
      message: "Promotion deleted successfully",
      id: promotion._id  // ✅ added
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete promotion", error: err.message });
  }
};

// ✅ Get Promotion Summary
const getPromotionSummary = async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;

    const promotions = await Promotion.find(query)
      .select(
        "campaignName targetAudience status promotionType startDate endDate categories images"
      )
      .populate("categories.category brands.brand", "name slug");

    const summary = promotions.map((p) => ({
      id: p._id,  // ✅ added
      name: p.campaignName,
      audience: p.targetAudience,
      status: p.status,
      type: p.promotionType,
      duration: `${p.startDate.toISOString().split("T")[0]} to ${p.endDate.toISOString().split("T")[0]}`,
      images: p.images || [],
      brands: p.brands.map((b) => ({
        id: b.brand?._id,
        slug: b.slug || b.brand?.slug,
        name: b.brand?.name,
      })),
      categories: p.categories.map((c) => ({
        id: c.category?._id,
        slug: c.slug || c.category?.slug,
        name: c.category?.name,
      })),
      countdown: p.countdown,
    }));
    res.status(200).json(summary);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch summary", error: err.message });
  }
};

// ✅ Get Promotion List
const getPromotionList = async (req, res) => {
  try {
    const promotions = await Promotion.find()
      .select(
        "campaignName promotionType startDate endDate status targetAudience categories images"
      )
      .populate("categories.category brands.brand", "name slug");

    const list = promotions.map((p) => ({
      id: p._id,  // ✅ added
      name: p.campaignName,
      type: p.promotionType,
      startDate: p.startDate.toISOString().split("T")[0],
      endDate: p.endDate.toISOString().split("T")[0],
      status: p.status,
      targetGroup: p.targetAudience,
      images: p.images || [],
      brands: p.brands.map((b) => ({
        id: b.brand?._id,
        slug: b.slug || b.brand?.slug,
        name: b.brand?.name,
      })),
      categories: p.categories.map((c) => ({
        id: c.category?._id,
        slug: c.slug || c.category?.slug,
        name: c.category?.name,
      })),
      countdown: p.countdown,
    }));
    res.status(200).json(list);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch promotion list", error: err.message });
  }
};

export {
  createPromotion,
  getPromotionById,
  updatePromotion,
  deletePromotion,
  getPromotionSummary,
  getPromotionList,

};
