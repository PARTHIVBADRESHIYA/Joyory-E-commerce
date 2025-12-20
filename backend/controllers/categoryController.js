// controllers/categoryController.js
import Category from './../models/Category.js';
import Product from './../models/Product.js';
import Brand from './../models/Brand.js';
import slugify from 'slugify';
import mongoose from 'mongoose';
import { uploadToCloudinary, uploadMultipleToCloudinary } from '../middlewares/upload.js';
/* ---------------------- Helpers ---------------------- */

// ✅ Generate unique slug
const generateHierarchicalSlug = async (name, parent) => {
    let currentSlug = slugify(name, { lower: true });

    // If parent exists → prepend parent.slug
    if (parent) {
        currentSlug = `${parent.slug}-${currentSlug}`;
    }

    let finalSlug = currentSlug;
    let i = 1;

    // Ensure uniqueness
    while (await Category.findOne({ slug: finalSlug })) {
        finalSlug = `${currentSlug}-${i++}`;
    }

    return finalSlug;
};


const normalizeCategoryName = (name) => {
    if (!name) return name;

    // Trim outside spaces
    name = name.trim();

    // Remove multiple hyphens
    name = name.replace(/-+/g, "-");

    // Normalize spaces around hyphens → always " - "
    name = name.replace(/\s*-\s*/g, " - ");

    // Collapse multiple spaces into one (except around hyphens)
    name = name.replace(/\s+/g, " ");

    // Capitalize words properly
    name = name
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

    return name;
};


// ✅ Resolve parent category (by ID | slug | name)
const resolveParentId = async (parentId) => {
    if (!parentId) return null;

    if (mongoose.Types.ObjectId.isValid(parentId)) {
        const exists = await Category.findById(parentId).select('_id');
        return exists ? exists._id : null;
    }

    let parentCat = await Category.findOne({ slug: parentId }).select('_id');
    if (!parentCat) {
        parentCat = await Category.findOne({ name: { $regex: `^${parentId}$`, $options: "i" } }).select('_id');
    }
    return parentCat ? parentCat._id : null;
};

// ✅ Resolve brand(s) (accepts: array or single value → ObjectId | slug | name)
const resolveBrandIds = async (brandInputs) => {
    if (!brandInputs) return [];
    const inputs = Array.isArray(brandInputs) ? brandInputs : [brandInputs];

    const ids = [];
    for (const input of inputs) {
        let brandId = null;

        // Check if input is valid ObjectId
        if (mongoose.Types.ObjectId.isValid(input)) {
            const brand = await Brand.findById(input).select('_id');
            if (brand) {
                brandId = brand._id;
            }
        }

        // Otherwise match by slug or name (case-insensitive)
        if (!brandId) {
            let brandDoc = await Brand.findOne({ slug: input }).select('_id');
            if (!brandDoc) {
                brandDoc = await Brand.findOne({ name: { $regex: `^${input}$`, $options: "i" } }).select('_id');
            }
            if (brandDoc) {
                brandId = brandDoc._id;
            }
        }

        if (brandId) ids.push(brandId);
    }
    return ids;
};

/* ---------------------- Controllers ---------------------- */
// Create category
export const addCategory = async (req, res) => {
    try {
        let { name, description } = req.body;
        name = normalizeCategoryName(name);
        let { parentId } = req.body;

        if (!name)
            return res.status(400).json({ message: 'Name required' });

        // Normalize brand input: brands, brand, brands[]
        let brandInputs = req.body.brands || req.body.brand || req.body["brands[]"];
        if (brandInputs && !Array.isArray(brandInputs)) {
            brandInputs = [brandInputs];
        }

        // Check for duplicate category name
        const existingCategory = await Category.findOne({
            name: { $regex: `^${name}$`, $options: "i" },
        });
        if (existingCategory)
            return res.status(400).json({ message: "Category name already exists" });

        // Resolve parent & ancestors
        let parent = null;
        let ancestors = [];

        if (parentId) {
            const resolvedId = await resolveParentId(parentId);
            if (!resolvedId)
                return res.status(400).json({ message: "Parent category not found" });

            parent = await Category.findById(resolvedId);
            ancestors = [...(parent.ancestors || []), parent._id];
        }

        // Resolve brands
        const brandIds = await resolveBrandIds(brandInputs);
        if (brandInputs && brandIds.length === 0)
            return res.status(400).json({ message: "No valid brands found" });

        const slug = await generateHierarchicalSlug(name, parent);

        // -----------------------------
        // ✔ CLOUDINARY IMAGE UPLOADS
        // -----------------------------
        const bannerImages = await uploadMultipleToCloudinary(
            req.files?.bannerImage,
            "categories/banner"
        );

        const thumbnailImages = await uploadMultipleToCloudinary(
            req.files?.thumbnailImage,
            "categories/thumbnail"
        );

        // -----------------------------
        // ✔ Save Category
        // -----------------------------
        const category = new Category({
            name,
            slug,
            description,
            bannerImage: bannerImages,       // Array of Cloudinary URLs
            thumbnailImage: thumbnailImages, // Array of Cloudinary URLs
            parent: parent ? parent._id : null,
            ancestors,
            brands: brandIds,
        });

        await category.save();

        const fullCategory = await Category.findById(category._id)
            .populate("brands", "name slug")
            .populate("parent", "name slug");

        res.status(201).json({
            message: "Category created",
            category: fullCategory,
        });

    } catch (err) {
        console.error("❌ Add Category Error:", err);
        res.status(500).json({ message: err.message });
    }
};


export const getCategories = async (req, res) => {
    try {
        const categories = await Category.find()
            .sort({ name: 1 })
            .select("name slug description bannerImage thumbnailImage image parent brands ancestors") // include 'image'
            .populate("brands", "name slug")
            .populate("parent", "name slug");

        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        const category = await Category.findById(id)
            .select("name slug description bannerImage thumbnailImage image parent brands ancestors") // include 'image'
            .populate("brands", "name slug")
            .populate("parent", "name slug");

        if (!category) return res.status(404).json({ message: "Category not found" });

        res.json({ category });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};

export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parentId } = req.body;

        const category = await Category.findById(id);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        // ------- Duplicate Name -------
        if (name && name.toLowerCase() !== category.name.toLowerCase()) {
            const duplicate = await Category.findOne({
                name: { $regex: `^${name}$`, $options: 'i' },
                _id: { $ne: id }
            });
            if (duplicate) return res.status(400).json({ message: 'Category name already exists' });
        }

        // ------- Handle Parent Update -------
        if (parentId && parentId !== String(category.parent)) {
            const resolvedId = await resolveParentId(parentId);
            if (!resolvedId) return res.status(400).json({ message: 'New parent not found' });

            const descendants = await Category.find({ ancestors: category._id }, '_id').lean();
            if (descendants.some(d => String(d._id) === String(resolvedId))) {
                return res.status(400).json({ message: 'Invalid parent: would create cycle' });
            }

            const newParent = await Category.findById(resolvedId);
            category.parent = newParent._id;
            category.ancestors = [...(newParent.ancestors || []), newParent._id];

            // Recursively update children
            const updateDescendants = async (catId, parentAncestors) => {
                const children = await Category.find({ parent: catId });
                for (const child of children) {
                    child.ancestors = [...parentAncestors, catId];
                    await child.save();
                    await updateDescendants(child._id, child.ancestors);
                }
            };

            await updateDescendants(category._id, category.ancestors);
        }

        // ------- Brands Update -------
        let brandInputs = req.body.brands || req.body.brand || req.body['brands[]'];
        if (brandInputs && !Array.isArray(brandInputs)) brandInputs = [brandInputs];

        if (brandInputs) {
            const brandIds = await resolveBrandIds(brandInputs);
            if (brandIds.length === 0)
                return res.status(400).json({ message: `No valid brands found` });

            category.brands = brandIds;
        }

        if (name) {
            const normalizedName = normalizeCategoryName(name);

            if (normalizedName.toLowerCase() !== category.name.toLowerCase()) {
                const duplicate = await Category.findOne({
                    name: { $regex: `^${normalizedName}$`, $options: 'i' },
                    _id: { $ne: id }
                });
                if (duplicate) return res.status(400).json({ message: 'Category name already exists' });

                category.name = normalizedName;

                const parent = category.parent ? await Category.findById(category.parent) : null;
                category.slug = await generateHierarchicalSlug(normalizedName, parent);
            }
        }


        // ------- Description -------
        if (description !== undefined) category.description = description;

        // ------- Image Update (Cloudinary buffer upload) -------
        if (req.files?.bannerImage) {
            category.bannerImage = await uploadMultipleToCloudinary(
                req.files.bannerImage,
                "categories/banner"
            );
        }

        if (req.files?.thumbnailImage) {
            category.thumbnailImage = await uploadMultipleToCloudinary(
                req.files.thumbnailImage,
                "categories/thumbnail"
            );
        }

        if (req.files?.image) {
            category.image = await uploadMultipleToCloudinary(
                req.files.image,
                "categories/image"
            );
        }

        await category.save();

        const fullCategory = await Category.findById(category._id)
            .populate("brands", "name slug")
            .populate("parent", "name slug");

        res.json({ message: 'Category updated', category: fullCategory });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};

// Delete category
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const child = await Category.findOne({ parent: id });
        if (child) return res.status(400).json({ message: 'Category has subcategories. Remove them first or use cascade.' });

        const productExists = await Product.exists({ $or: [{ categories: id }, { category: id }] });
        if (productExists) return res.status(400).json({ message: 'Category has products assigned. Remove/move products first.' });

        await Category.findByIdAndDelete(id);
        res.json({ message: 'Category deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};

export const setTopCategories = async (req, res) => {
    try {
        let { categoryIds } = req.body;

        if (!Array.isArray(categoryIds)) {
            return res.status(400).json({ message: "categoryIds must be an array" });
        }

        // 1️⃣ Remove top flag from all
        await Category.updateMany({}, { isTopCategory: false });

        // 2️⃣ Add top flag to selected categories
        await Category.updateMany(
            { _id: { $in: categoryIds } },
            { isTopCategory: true }
        );

        return res.status(200).json({
            success: true,
            message: "Top categories updated successfully",
        });

    } catch (err) {
        console.error("🔥 Failed to update top categories:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to update top categories",
            error: err.message
        });
    }
};
