
import Promotion from "../models/Promotion.js";
import Category from "../models/Category.js";

// 🔹 Auto-calculate promotion status
const calculateStatus = (start, end) => {
  const now = new Date();
  if (now < new Date(start)) return "upcoming";
  if (now > new Date(end)) return "expired";
  return "active";
};

// 🔹 Helper: resolve categories (accepts _id or slug or object)
const resolveCategories = async (categories) => {
  if (!categories || categories.length === 0) return [];

  const resolved = await Promise.all(
    categories.map(async (c) => {
      if (typeof c === "object" && c._id) {
        // Already full object from frontend
        return {
          category: c._id,
          slug: c.slug || "",
          customId: c._id.toString(),
        };
      }

      if (/^[0-9a-fA-F]{24}$/.test(c)) {
        // ✅ Plain ObjectId string
        const cat = await Category.findById(c).select("_id slug");
        return cat
          ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() }
          : null;
      } else {
        // ✅ Slug string
        const cat = await Category.findOne({ slug: c }).select("_id slug");
        return cat
          ? { category: cat._id, slug: cat.slug, customId: cat._id.toString() }
          : null;
      }
    })
  );

  return resolved.filter((c) => c !== null);
};

// ✅ Create Promotion
const createPromotion = async (req, res) => {
  try {
    const status = calculateStatus(req.body.startDate, req.body.endDate);

    const resolvedCategories = await resolveCategories(req.body.categories);

    const promotion = await Promotion.create({
      ...req.body,
      categories: resolvedCategories,
      status,
    });

    res.status(201).json({ message: "Promotion created", promotion });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to create promotion", error: err.message });
  }
};

// ✅ Update Promotion
const updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;

    const status = calculateStatus(req.body.startDate, req.body.endDate);

    const resolvedCategories = await resolveCategories(req.body.categories);

    const promotion = await Promotion.findByIdAndUpdate(
      id,
      { ...req.body, categories: resolvedCategories, status },
      { new: true, runValidators: true }
    );

    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    res.status(200).json({ message: "Promotion updated", promotion });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update promotion", error: err.message });
  }
};


// ✅ Delete Promotion
const deletePromotion = async (req, res) => {
  try {
    const { id } = req.params;

    const promotion = await Promotion.findByIdAndDelete(id);

    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    res.status(200).json({ message: "Promotion deleted successfully" });
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
      .select("campaignName targetAudience status promotionType startDate endDate categories")
      .populate("categories", "name slug");

    const summary = promotions.map((p) => ({
      name: p.campaignName,
      audience: p.targetAudience,
      status: p.status,
      type: p.promotionType,
      duration: `${p.startDate.toISOString().split("T")[0]} to ${p.endDate
        .toISOString()
        .split("T")[0]}`,
      categories: p.categories.map((c) => ({ id: c._id, slug: c.slug, name: c.name })),
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
      .select("campaignName promotionType startDate endDate status targetAudience categories")
      .populate("categories", "name slug");

    const list = promotions.map((p) => ({
      id: p._id,
      name: p.campaignName,
      type: p.promotionType,
      startDate: p.startDate.toISOString().split("T")[0],
      endDate: p.endDate.toISOString().split("T")[0],
      status: p.status,
      targetGroup: p.targetAudience,
      categories: p.categories.map((c) => ({ id: c._id, slug: c.slug, name: c.name })),
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
  updatePromotion,
  deletePromotion,
  getPromotionSummary,
  getPromotionList,
};
