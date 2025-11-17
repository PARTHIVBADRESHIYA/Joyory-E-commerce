// controllers/categoryController.js
import Category from './../models/Category.js';
import Product from './../models/Product.js';
import Brand from './../models/Brand.js';
import slugify from 'slugify';
import mongoose from 'mongoose';

/* ---------------------- Helpers ---------------------- */

// ✅ Generate unique slug
const generateUniqueSlug = async (base) => {
    let slug = slugify(base, { lower: true });
    let i = 1;
    while (await Category.findOne({ slug })) {
        slug = `${slugify(base, { lower: true })}-${i++}`;
    }
    return slug;
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
        const { name, description } = req.body;
        let { parentId } = req.body;

        if (!name) return res.status(400).json({ message: 'Name required' });

        // Normalize brand inputs
        let brandInputs = req.body.brands || req.body.brand || req.body['brands[]'];
        if (brandInputs && !Array.isArray(brandInputs)) brandInputs = [brandInputs];

        // Check duplicate category name
        const existingCategory = await Category.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existingCategory) return res.status(400).json({ message: 'Category name already exists' });

        // Resolve parent & ancestors
        let parent = null;
        let ancestors = [];
        if (parentId) {
            const resolvedId = await resolveParentId(parentId);
            if (!resolvedId) return res.status(400).json({ message: 'Parent category not found' });

            parent = await Category.findById(resolvedId);
            ancestors = [...(parent.ancestors || []), parent._id];
        }

        // Resolve brands
        const brandIds = await resolveBrandIds(brandInputs);
        if (brandInputs && brandIds.length === 0) return res.status(400).json({ message: `No valid brands found` });

        const slug = await generateUniqueSlug(name);

        // Handle file uploads
        const bannerImages = (req.files?.bannerImage || []).slice(0, 5).map(f => f.path);
        const thumbnailImages = (req.files?.thumbnailImage || []).slice(0, 5).map(f => f.path);
        const images = (req.files?.image || []).slice(0, 5).map(f => f.path); // new field

        const category = new Category({
            name,
            slug,
            description,
            bannerImage: bannerImages,
            thumbnailImage: thumbnailImages,
            image: images, // new field
            parent: parent ? parent._id : null,
            ancestors,
            brands: brandIds
        });

        await category.save();

        const fullCategory = await Category.findById(category._id)
            .populate("brands", "name slug")
            .populate("parent", "name slug");

        res.status(201).json({ message: 'Category created', category: fullCategory });

    } catch (err) {
        console.error(err);
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

// Update category
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parentId } = req.body;

        const category = await Category.findById(id);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        // Check duplicate name
        if (name && name.toLowerCase() !== category.name.toLowerCase()) {
            const duplicate = await Category.findOne({
                name: { $regex: `^${name}$`, $options: 'i' },
                _id: { $ne: id }
            });
            if (duplicate) return res.status(400).json({ message: 'Category name already exists' });
        }

        // Handle parent change (same as before)
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

        // Update brands
        let brandInputs = req.body.brands || req.body.brand || req.body['brands[]'];
        if (brandInputs && !Array.isArray(brandInputs)) brandInputs = [brandInputs];
        if (brandInputs) {
            const brandIds = await resolveBrandIds(brandInputs);
            if (brandIds.length === 0) return res.status(400).json({ message: `No valid brands found` });
            category.brands = brandIds;
        }

        // Update name + slug
        if (name && name !== category.name) {
            category.name = name;
            category.slug = await generateUniqueSlug(name);
        }

        // Update description
        if (description !== undefined) category.description = description;

        // Update images
        if (req.files?.bannerImage) category.bannerImage = req.files.bannerImage.slice(0, 5).map(f => f.path);
        if (req.files?.thumbnailImage) category.thumbnailImage = req.files.thumbnailImage.slice(0, 5).map(f => f.path);
        if (req.files?.image) category.image = req.files.image.slice(0, 5).map(f => f.path); // new field

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
