// controllers/admin/brandAdminController.js
import Brand from "../models/Brand.js";
import { toSlug } from "../middlewares/utils/slug.js";

/**
 * Create new brand
 */
export const createBrand = async (req, res) => {
    try {
        const { name, description } = req.body;

        const slug = toSlug(name);
        const existing = await Brand.findOne({ slug });
        if (existing) return res.status(400).json({ message: "Brand already exists" });

        const logo = req.files?.logo?.[0]?.path || null;
        const banner = req.files?.banner?.[0]?.path || null;

        const brand = await Brand.create({ name, slug, description, logo, banner });
        res.status(201).json({ message: "Brand created", brand });
    } catch (err) {
        res.status(500).json({ message: "Failed to create brand", error: err.message });
    }
};

/**
 * Update brand
 */
export const updateBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;

        const update = {};
        if (name) {
            update.name = name;
            update.slug = toSlug(name);
        }
        if (description !== undefined) update.description = description;
        if (isActive !== undefined) update.isActive = isActive;

        if (req.files?.logo?.[0]) update.logo = req.files.logo[0].path;
        if (req.files?.banner?.[0]) update.banner = req.files.banner[0].path;

        const brand = await Brand.findByIdAndUpdate(id, update, { new: true });
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        res.json({ message: "Brand updated", brand });
    } catch (err) {
        res.status(500).json({ message: "Failed to update brand", error: err.message });
    }
};

/**
 * Delete brand
 */
export const deleteBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const brand = await Brand.findByIdAndDelete(id);
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        res.json({ message: "Brand deleted" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete brand", error: err.message });
    }
};

/**
 * Get all brands (admin)
 */
export const getAllBrandsAdmin = async (req, res) => {
    try {
        const brands = await Brand.find().sort({ createdAt: -1 });
        res.json(brands);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch brands", error: err.message });
    }
};
