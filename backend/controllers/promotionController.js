
// import Promotion from "../models/Promotion.js";
// import Category from "../models/Category.js";

// // 🔹 Auto-calculate promotion status
// const calculateStatus = (start, end) => {
//   const now = new Date();
//   if (now < new Date(start)) return "upcoming";
//   if (now > new Date(end)) return "expired";
//   return "active";
// };

// // 🔹 Helper: resolve categories (accepts _id or slug or object)
// const resolveCategories = async (categories) => {
//   if (!categories || categories.length === 0) return [];

//   const resolved = await Promise.all(
//     categories.map(async (c) => {
//       if (typeof c === "object" && c._id) {
//         // Already full object from frontend
//         return {
//           category: c._id,
//           slug: c.slug || "",
//           customId: c._id.toString(),
//         };
//       }

//       if (/^[0-9a-fA-F]{24}$/.test(c)) {
//         // ✅ Plain ObjectId string
//         const cat = await Category.findById(c).select("_id slug");
//         return cat
//           ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() }
//           : null;
//       } else {
//         // ✅ Slug string
//         const cat = await Category.findOne({ slug: c }).select("_id slug");
//         return cat
//           ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() }
//           : null;
//       }
//     })
//   );

//   return resolved.filter((c) => c !== null);
// };

// // ✅ Create Promotion
// const createPromotion = async (req, res) => {
//   try {
//     const status = calculateStatus(req.body.startDate, req.body.endDate);

//     const resolvedCategories = await resolveCategories(req.body.categories);

//     const promotion = await Promotion.create({
//       ...req.body,
//       categories: resolvedCategories,
//       status,
//     });

//     res.status(201).json({ message: "Promotion created", promotion });
//   } catch (err) {
//     res
//       .status(500)
//       .json({ message: "Failed to create promotion", error: err.message });
//   }
// };

// // ✅ Update Promotion
// const updatePromotion = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const status = calculateStatus(req.body.startDate, req.body.endDate);

//     const resolvedCategories = await resolveCategories(req.body.categories);

//     const promotion = await Promotion.findByIdAndUpdate(
//       id,
//       { ...req.body, categories: resolvedCategories, status },
//       { new: true, runValidators: true }
//     );

//     if (!promotion) {
//       return res.status(404).json({ message: "Promotion not found" });
//     }

//     res.status(200).json({ message: "Promotion updated", promotion });
//   } catch (err) {
//     res
//       .status(500)
//       .json({ message: "Failed to update promotion", error: err.message });
//   }
// };


// // ✅ Delete Promotion
// const deletePromotion = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const promotion = await Promotion.findByIdAndDelete(id);

//     if (!promotion) {
//       return res.status(404).json({ message: "Promotion not found" });
//     }

//     res.status(200).json({ message: "Promotion deleted successfully" });
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
//       .select("campaignName targetAudience status promotionType startDate endDate categories")
//       .populate("categories", "name slug");

//     const summary = promotions.map((p) => ({
//       name: p.campaignName,
//       audience: p.targetAudience,
//       status: p.status,
//       type: p.promotionType,
//       duration: `${p.startDate.toISOString().split("T")[0]} to ${p.endDate
//         .toISOString()
//         .split("T")[0]}`,
//       categories: p.categories.map((c) => ({ id: c._id, slug: c.slug, name: c.name })),
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
//       .select("campaignName promotionType startDate endDate status targetAudience categories")
//       .populate("categories", "name slug");

//     const list = promotions.map((p) => ({
//       id: p._id,
//       name: p.campaignName,
//       type: p.promotionType,
//       startDate: p.startDate.toISOString().split("T")[0],
//       endDate: p.endDate.toISOString().split("T")[0],
//       status: p.status,
//       targetGroup: p.targetAudience,
//       categories: p.categories.map((c) => ({ id: c._id, slug: c.slug, name: c.name })),
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
//   updatePromotion,
//   deletePromotion,
//   getPromotionSummary,
//   getPromotionList,
// };

import Promotion from "../models/Promotion.js";
import Category from "../models/Category.js";

// 🔹 Auto-calculate promotion status
const calculateStatus = (start, end) => {
  const now = new Date();
  if (now < new Date(start)) return "upcoming";
  if (now > new Date(end)) return "expired";
  return "active";
};

// 🔹 Helper: resolve categories (accepts _id, slug, or object)
const resolveCategories = async (categories) => {
  if (!categories || categories.length === 0) return [];

  const resolved = await Promise.all(
    categories.map(async (c) => {
      if (typeof c === "object" && c._id) {
        return { category: c._id, slug: c.slug || "", customId: c._id.toString() };
      }
      if (typeof c === "object" && c.category) {
        return { category: c.category, slug: c.slug || "", customId: c.category.toString() };
      }
      if (typeof c === "string" && /^[0-9a-fA-F]{24}$/.test(c)) {
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

  return resolved.filter((c) => c !== null);
};

// ✅ Create Promotion
const createPromotion = async (req, res) => {
  try {
    const status = calculateStatus(req.body.startDate, req.body.endDate);
    const resolvedCategories = await resolveCategories(req.body.categories);

    let images = [];

    // case 1: uploaded files (multer-storage-cloudinary gives Cloudinary URLs in .path)
    if (req.files && req.files.length > 0) {
      const uploaded = req.files.map((file) => file.path);
      images.push(...uploaded);
    }

    // case 2: image(s) from body
    if (req.body.image) images.push(req.body.image);
    if (Array.isArray(req.body.images)) {
      images.push(...req.body.images.filter((img) => !!img));
    }

    const promotion = await Promotion.create({
      ...req.body,
      categories: resolvedCategories,
      status,
      images,
    });

    res.status(201).json({ message: "Promotion created", promotion });
  } catch (err) {
    res.status(500).json({ message: "Failed to create promotion", error: err.message });
  }
};

// ✅ Update Promotion
const updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const status = calculateStatus(req.body.startDate, req.body.endDate);
    const resolvedCategories = await resolveCategories(req.body.categories);

    let images = [];

    // case 1: new uploaded files → already Cloudinary URLs
    if (req.files && req.files.length > 0) {
      const uploaded = req.files.map((file) => file.path);
      images.push(...uploaded);
    }

    // case 2: body images (keep existing or add new URLs)
    if (req.body.image) images.push(req.body.image);
    if (Array.isArray(req.body.images)) {
      images.push(...req.body.images.filter((img) => !!img));
    }

    // ✅ Merge with existing images if any
    const existing = await Promotion.findById(id).select("images");
    const updateData = {
      ...req.body,
      categories: resolvedCategories,
      status,
      images: images.length > 0 ? [...(existing?.images || []), ...images] : existing?.images,
    };

    const promotion = await Promotion.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    res.status(200).json({ message: "Promotion updated", promotion });
  } catch (err) {
    res.status(500).json({ message: "Failed to update promotion", error: err.message });
  }
};

// ✅ Delete Promotion
const deletePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const promotion = await Promotion.findByIdAndDelete(id);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });
    res.status(200).json({ message: "Promotion deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete promotion", error: err.message });
  }
};

// ✅ Get Promotion Summary
const getPromotionSummary = async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;

    const promotions = await Promotion.find(query)
      .select("campaignName targetAudience status promotionType startDate endDate categories images")
      .populate("categories.category", "name slug");

    const summary = promotions.map((p) => ({
      name: p.campaignName,
      audience: p.targetAudience,
      status: p.status,
      type: p.promotionType,
      duration: `${p.startDate.toISOString().split("T")[0]} to ${p.endDate
        .toISOString()
        .split("T")[0]}`,
      images: p.images || [],
      categories: p.categories.map((c) => ({
        id: c.category?._id,
        slug: c.slug || c.category?.slug,
        name: c.category?.name,
      })),
      countdown: p.countdown,
    }));

    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch summary", error: err.message });
  }
};

// ✅ Get Promotion List
const getPromotionList = async (req, res) => {
  try {
    const promotions = await Promotion.find()
      .select("campaignName promotionType startDate endDate status targetAudience categories images")
      .populate("categories.category", "name slug");

    const list = promotions.map((p) => ({
      id: p._id,
      name: p.campaignName,
      type: p.promotionType,
      startDate: p.startDate.toISOString().split("T")[0],
      endDate: p.endDate.toISOString().split("T")[0],
      status: p.status,
      targetGroup: p.targetAudience,
      images: p.images || [],
      categories: p.categories.map((c) => ({
        id: c.category?._id,
        slug: c.slug || c.category?.slug,
        name: c.category?.name,
      })),
      countdown: p.countdown,
    }));

    res.status(200).json(list);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch promotion list", error: err.message });
  }
};

export {
  createPromotion,
  updatePromotion,
  deletePromotion,
  getPromotionSummary,
  getPromotionList,
};
