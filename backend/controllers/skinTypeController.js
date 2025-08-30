// controllers/admin/skinTypeController.js
import SkinType from "../models/SkinType.js";
import Product from "../models/Product.js";
import { generateUniqueSlug } from "../middlewares/utils/slug.js";
import mongoose from "mongoose";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// POST /admin/skin-types
export const createSkinType = async (req, res) => {
    try {
        const { name, description = "", isActive = true } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "'name' is required" });
        }

        const nameExists = await SkinType.findOne({ name: name.trim() });
        if (nameExists) {
            return res.status(409).json({ success: false, message: "Skin type with this name already exists" });
        }

        const slug = await generateUniqueSlug(SkinType, name.trim());
        const image = req.files?.image?.[0]?.path || null;


        const skinType = await SkinType.create({ name: name.trim(), slug, description, isActive, image });
        return res.status(201).json({ success: true, data: skinType });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};


// GET /admin/skin-types  (q, isActive, page, limit)
export const listSkinTypes = async (req, res) => {
    try {
        const { q = "", isActive, page = 1, limit = 20 } = req.query;
        const filters = { isDeleted: false };

        if (q) filters.name = { $regex: q, $options: "i" };
        if (typeof isActive !== "undefined") filters.isActive = isActive === "true";

        const pg = Math.max(parseInt(page, 10) || 1, 1);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

        const pipeline = [
            { $match: filters },
            {
                $lookup: {
                    from: "products",
                    let: { sid: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: [
                                        "$$sid",
                                        { $ifNull: ["$skinTypes", []] } // ✅ ensure always an array
                                    ]
                                },
                                isDeleted: { $ne: true }
                            }
                        },
                        { $count: "count" },
                    ],
                    as: "stats",
                },
            },
            {
                $addFields: {
                    productCount: {
                        $ifNull: [{ $arrayElemAt: ["$stats.count", 0] }, 0]
                    }
                }
            },
            { $project: { stats: 0 } },
            { $sort: { name: 1 } },
            { $skip: (pg - 1) * lim },
            { $limit: lim },
        ];

        const [rows, total] = await Promise.all([
            SkinType.aggregate(pipeline),
            SkinType.countDocuments(filters),
        ]);

        return res.json({
            success: true,
            data: rows,
            pagination: { page: pg, limit: lim, total }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};


// GET /admin/skin-types/:id
export const getSkinTypeById = async (req, res) => {
    try {
        const { id } = req.params;
        const skinType = await SkinType.findOne({ _id: id, isDeleted: false });
        if (!skinType) return res.status(404).json({ success: false, message: "Skin type not found" });
        return res.json({ success: true, data: skinType });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// PUT /admin/skin-types/:id
export const updateSkinType = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;

        const skinType = await SkinType.findOne({ _id: id, isDeleted: false });
        if (!skinType) return res.status(404).json({ success: false, message: "Skin type not found" });

        if (name && name.trim() !== skinType.name) {
            const nameExists = await SkinType.findOne({ name: name.trim(), _id: { $ne: toObjectId(id) } });
            if (nameExists) {
                return res.status(409).json({ success: false, message: "Another skin type already uses this name" });
            }
            skinType.name = name.trim();
            skinType.slug = await generateUniqueSlug(SkinType, name.trim());
        }

        if (typeof description !== "undefined") skinType.description = description;
        if (typeof isActive !== "undefined") skinType.isActive = !!isActive;

        if (req.files?.image?.[0]) skinType.image = req.files.image[0].path;

        await skinType.save();
        return res.json({ success: true, data: skinType });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};



// PATCH /admin/skin-types/:id/toggle
export const toggleSkinType = async (req, res) => {
    try {
        const { id } = req.params;
        const skinType = await SkinType.findOne({ _id: id, isDeleted: false });
        if (!skinType) return res.status(404).json({ success: false, message: "Skin type not found" });
        skinType.isActive = !skinType.isActive;
        await skinType.save();
        return res.json({ success: true, data: skinType });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /admin/skin-types/:id  (soft delete)
export const softDeleteSkinType = async (req, res) => {
    try {
        const { id } = req.params;
        const skinType = await SkinType.findOne({ _id: id, isDeleted: false });
        if (!skinType) return res.status(404).json({ success: false, message: "Skin type not found" });

        await SkinType.deleteOne({ _id: id });
        return res.json({ success: true, message: "Skin type deleted" });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /admin/skin-types/:id/restore
export const restoreSkinType = async (req, res) => {
    try {
        const { id } = req.params;
        const skinType = await SkinType.findOne({ _id: id, isDeleted: true });
        if (!skinType) return res.status(404).json({ success: false, message: "Skin type not found or not deleted" });

        skinType.isDeleted = false;
        skinType.isActive = true;
        await skinType.save();
        return res.json({ success: true, data: skinType });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};