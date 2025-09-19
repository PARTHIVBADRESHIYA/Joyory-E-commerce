
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

// ✅ Create
// const createPromotion = async (req, res) => {
//   try {
//     const status = calculateStatus(req.body.startDate, req.body.endDate);
//     const categories = await resolveCategories(req.body.categories);
//     const brands = await resolveBrands(req.body.brands);

//     // Images
//     const images = [
//       ...(req.files?.map((f) => f.path) || []),
//       ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
//       ...(req.body.image ? [req.body.image] : []),
//     ];

//     const { promotionConfig } = await normalizeByType(req.body);

//     const promotion = await Promotion.create({
//       ...req.body,
//       categories,
//       isScheduled: true,
//       brands,
//       status,
//       images,
//       promotionConfig,
//     });

//     res.status(201).json({ message: "Promotion created", promotion });
//   } catch (err) {
//     res.status(400).json({ message: "Failed to create promotion", error: err.message });
//   }
// };

// ✅ Create
const createPromotion = async (req, res) => {
  try {
    if (!req.body.startDate || !req.body.endDate) {
      return res
        .status(400)
        .json({ message: "❌ startDate and endDate are required" });
    }

    // ✅ Parse IST → UTC
    let startDateUTC, endDateUTC;
    try {
      startDateUTC = parseISTtoUTC(req.body.startDate, "startDate");
      endDateUTC = parseISTtoUTC(req.body.endDate, "endDate");
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    if (endDateUTC <= startDateUTC) {
      return res
        .status(400)
        .json({ message: "❌ endDate must be after startDate" });
    }

    const categories = await resolveCategories(req.body.categories);
    const brands = await resolveBrands(req.body.brands);

    // Images
    const images = [
      ...(req.files?.map((f) => f.path) || []),
      ...(Array.isArray(req.body.images)
        ? req.body.images.filter(Boolean)
        : []),
      ...(req.body.image ? [req.body.image] : []),
    ];

    const { promotionConfig } = await normalizeByType(req.body);

    // ✅ Status calculation based on UTC
    const status = calculateStatus(startDateUTC, endDateUTC);
    const isScheduled = status === "upcoming"; // 👈 fix

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
    });

    res.status(201).json({
      message: "✅ Promotion created",
      id: promotion._id,  // ✅ added
      promotion
    });

  } catch (err) {
    res.status(400).json({
      message: "❌ Failed to create promotion",
      error: err.message,
    });
  }
};
// ✅ Simplified Update Promotion
// controllers/admin/promotionController.js
// ✅ Get Promotion by ID
const getPromotionById = async (req, res) => {
  try {
    const { id } = req.params;

    const promotion = await Promotion.findById(id)
      .populate("categories.category brands.brand", "name slug");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    res.status(200).json({
      _id: promotion._id,
      name: promotion.campaignName,
      type: promotion.promotionType,
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
      countdown: promotion.countdown,
      isScheduled: promotion.isScheduled,
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

    // compute status fresh
    const status = calculateStatus(req.body.startDate, req.body.endDate);

    // resolve categories & brands (only if provided)
    const categories = req.body.categories
      ? await resolveCategories(req.body.categories)
      : undefined;

    const brands = req.body.brands
      ? await resolveBrands(req.body.brands)
      : undefined;

    // handle images
    const incomingImages = [
      ...(req.files?.map((f) => f.path) || []),
      ...(Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : []),
      ...(req.body.image ? [req.body.image] : []),
    ];

    const existing = await Promotion.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    // ✅ Normalize promotionConfig if passed
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

    // prepare update data
    const updateData = {
      ...req.body, // take all body fields directly
      status,
      ...(categories !== undefined && { categories }),
      ...(brands !== undefined && { brands }),
      images: incomingImages.length
        ? [...(existing.images || []), ...incomingImages]
        : existing.images,
      promotionConfig: normalizedConfig, // ✅ allow update
    };

    // prevent overwriting promotionType accidentally (unless explicitly provided)
    if (!req.body.promotionType) {
      updateData.promotionType = existing.promotionType;
    }

    const promotion = await Promotion.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      message: "Promotion updated",
      id: promotion._id,  // ✅ added
      promotion
    });
  } catch (err) {
    res
      .status(400)
      .json({ message: "Failed to update promotion", error: err.message });
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
