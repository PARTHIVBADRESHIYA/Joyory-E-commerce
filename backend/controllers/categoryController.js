// import Category from './../models/Category.js';
// import Product from './../models/Product.js';
// import slugify from 'slugify';
// import mongoose from 'mongoose';

// // helper to create unique slug
// const generateUniqueSlug = async (base) => {
//     let slug = slugify(base, { lower: true });
//     let i = 1;
//     while (await Category.findOne({ slug })) {
//         slug = `${slugify(base, { lower: true })}-${i++}`;
//     }
//     return slug;
// };

// // helper to normalize parentId input
// const resolveParentId = async (parentId) => {
//     if (!parentId) return null;

//     // Already ObjectId
//     if (mongoose.Types.ObjectId.isValid(parentId)) {
//         const exists = await Category.findById(parentId).select('_id');
//         return exists ? exists._id : null;
//     }

//     // Try slug
//     let parentCat = await Category.findOne({ slug: parentId }).select('_id');
//     if (!parentCat) {
//         // Try name
//         parentCat = await Category.findOne({ name: parentId }).select('_id');
//     }
//     return parentCat ? parentCat._id : null;
// };

// // Create category
// export const addCategory = async (req, res) => {
//     try {
//         const { name, description, bannerImage, thumbnailImage } = req.body;
//         let { parentId } = req.body;

//         if (!name) {
//             return res.status(400).json({ message: 'Name required' });
//         }

//         // 🚫 Check case-insensitive duplicate
//         const existingCategory = await Category.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
//         if (existingCategory) {
//             return res.status(400).json({ message: 'Category name already exists' });
//         }

//         let parent = null;
//         let ancestors = [];

//         if (parentId) {
//             const resolvedId = await resolveParentId(parentId);
//             if (!resolvedId) {
//                 return res.status(400).json({ message: 'Parent category not found' });
//             }
//             parent = await Category.findById(resolvedId);
//             ancestors = [...(parent.ancestors || []), parent._id];
//         }

//         const slug = await generateUniqueSlug(name);

//         const category = new Category({
//             name,
//             slug,
//             description,
//             bannerImage: bannerImage || null,
//             thumbnailImage: thumbnailImage || null,
//             parent: parent ? parent._id : null,
//             ancestors
//         });

//         await category.save();
//         res.status(201).json({ message: 'Category created', category });

//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: err.message });
//     }
// };

// // Get all categories (admin - flat list)
// export const getCategories = async (req, res) => {
//     try {
//         const categories = await Category.find().sort({ name: 1 });
//         res.json(categories);
//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };

// // Update category
// export const updateCategory = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { name, description, parentId } = req.body;

//         const category = await Category.findById(id);
//         if (!category) {
//             return res.status(404).json({ message: 'Category not found' });
//         }

//         // 🚫 Check for duplicate name (case-insensitive)
//         if (name && name.toLowerCase() !== category.name.toLowerCase()) {
//             const duplicate = await Category.findOne({
//                 name: { $regex: `^${name}$`, $options: 'i' },
//                 _id: { $ne: id }
//             });
//             if (duplicate) {
//                 return res.status(400).json({ message: 'Category name already exists' });
//             }
//         }

//         // Handle parent change
//         if (parentId && parentId !== String(category.parent)) {
//             const resolvedId = await resolveParentId(parentId);
//             if (!resolvedId) {
//                 return res.status(400).json({ message: 'New parent not found' });
//             }

//             // prevent cycles
//             const descendants = await Category.find({ ancestors: category._id }, '_id').lean();
//             if (descendants.some(d => String(d._id) === String(resolvedId))) {
//                 return res.status(400).json({ message: 'Invalid parent: would create cycle' });
//             }

//             const newParent = await Category.findById(resolvedId);
//             const newAncestors = [...(newParent.ancestors || []), newParent._id];
//             category.parent = newParent._id;
//             category.ancestors = newAncestors;

//             // recursively update descendants
//             const updateDescendants = async (catId, parentAncestors) => {
//                 const children = await Category.find({ parent: catId });
//                 for (const child of children) {
//                     child.ancestors = [...parentAncestors, catId];
//                     await child.save();
//                     await updateDescendants(child._id, child.ancestors);
//                 }
//             };
//             await updateDescendants(category._id, category.ancestors);
//         }

//         // Name/slug update
//         if (name && name !== category.name) {
//             category.name = name;
//             category.slug = await generateUniqueSlug(name);
//         }

//         // Description update
//         if (description !== undefined) {
//             category.description = description;
//         }

//         // ✅ Handle bannerImage (uploaded using .fields())
//         if (req.files?.bannerImage && req.files.bannerImage[0]) {
//             category.bannerImage = req.files.bannerImage[0].path; // Cloudinary URL
//         }

//         // ✅ Handle thumbnailImage (uploaded using .fields())
//         if (req.files?.thumbnailImage && req.files.thumbnailImage[0]) {
//             category.thumbnailImage = req.files.thumbnailImage[0].path;
//         }

//         await category.save();
//         res.json({ message: 'Category updated', category });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: err.message });
//     }
// };


// // Delete category
// export const deleteCategory = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const child = await Category.findOne({ parent: id });
//         if (child) return res.status(400).json({ message: 'Category has subcategories. Remove them first or use cascade.' });

//         const productExists = await Product.exists({ $or: [{ categories: id }, { category: id }] });
//         if (productExists) return res.status(400).json({ message: 'Category has products assigned. Remove/move products first.' });

//         await Category.findByIdAndDelete(id);
//         res.json({ message: 'Category deleted' });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: err.message });
//     }
// };































// controllers/categoryController.js
import Category from './../models/Category.js';
import Product from './../models/Product.js';
import Brand from './../models/Brand.js';
import slugify from 'slugify';
import mongoose from 'mongoose';

// helper to create unique slug
const generateUniqueSlug = async (base) => {
    let slug = slugify(base, { lower: true });
    let i = 1;
    while (await Category.findOne({ slug })) {
        slug = `${slugify(base, { lower: true })}-${i++}`;
    }
    return slug;
};

// helper to normalize parentId input
const resolveParentId = async (parentId) => {
    if (!parentId) return null;

    if (mongoose.Types.ObjectId.isValid(parentId)) {
        const exists = await Category.findById(parentId).select('_id');
        return exists ? exists._id : null;
    }

    let parentCat = await Category.findOne({ slug: parentId }).select('_id');
    if (!parentCat) {
        parentCat = await Category.findOne({ name: parentId }).select('_id');
    }
    return parentCat ? parentCat._id : null;
};

// helper to normalize multiple brands input (array of ObjectId | slug | name)
const resolveBrandIds = async (brandInputs) => {
    if (!brandInputs) return [];
    const inputs = Array.isArray(brandInputs) ? brandInputs : [brandInputs];

    const ids = [];
    for (const input of inputs) {
        let brandId = null;

        if (mongoose.Types.ObjectId.isValid(input)) {
            const brand = await Brand.findById(input).select('_id');
            brandId = brand ? brand._id : null;
        }

        if (!brandId) {
            let brandDoc = await Brand.findOne({ slug: input }).select('_id');
            if (!brandDoc) {
                brandDoc = await Brand.findOne({ name: { $regex: `^${input}$`, $options: "i" } }).select('_id');
            }
            brandId = brandDoc ? brandDoc._id : null;
        }

        if (brandId) ids.push(brandId);
    }
    return ids;
};

// Create category
export const addCategory = async (req, res) => {
    try {
        const { name, description, bannerImage, thumbnailImage, brand } = req.body;
        let { parentId } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Name required' });
        }

        // check duplicate category name
        const existingCategory = await Category.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existingCategory) {
            return res.status(400).json({ message: 'Category name already exists' });
        }

        // resolve parent
        let parent = null;
        let ancestors = [];
        if (parentId) {
            const resolvedId = await resolveParentId(parentId);
            if (!resolvedId) {
                return res.status(400).json({ message: 'Parent category not found' });
            }
            parent = await Category.findById(resolvedId);
            ancestors = [...(parent.ancestors || []), parent._id];
        }

        // resolve brands (multiple)
        const brandIds = await resolveBrandIds(brand);
        if (brand && brandIds.length === 0) {
            return res.status(400).json({ message: `No valid brands found for input` });
        }

        const slug = await generateUniqueSlug(name);

        const category = new Category({
            name,
            slug,
            description,
            bannerImage: bannerImage || null,
            thumbnailImage: thumbnailImage || null,
            parent: parent ? parent._id : null,
            ancestors,
            brands: brandIds   // ✅ multiple brands
        });

        await category.save();
        res.status(201).json({ message: 'Category created', category });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};

// Get all categories (admin - flat list)
export const getCategories = async (req, res) => {
    try {
        const categories = await Category.find()
            .sort({ name: 1 })
            .populate("brands", "name slug");  // ✅ populate multiple brands
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Update category
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parentId, brand } = req.body;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // check duplicate name
        if (name && name.toLowerCase() !== category.name.toLowerCase()) {
            const duplicate = await Category.findOne({
                name: { $regex: `^${name}$`, $options: 'i' },
                _id: { $ne: id }
            });
            if (duplicate) {
                return res.status(400).json({ message: 'Category name already exists' });
            }
        }

        // handle parent change
        if (parentId && parentId !== String(category.parent)) {
            const resolvedId = await resolveParentId(parentId);
            if (!resolvedId) {
                return res.status(400).json({ message: 'New parent not found' });
            }

            const descendants = await Category.find({ ancestors: category._id }, '_id').lean();
            if (descendants.some(d => String(d._id) === String(resolvedId))) {
                return res.status(400).json({ message: 'Invalid parent: would create cycle' });
            }

            const newParent = await Category.findById(resolvedId);
            const newAncestors = [...(newParent.ancestors || []), newParent._id];
            category.parent = newParent._id;
            category.ancestors = newAncestors;

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

        // ✅ update multiple brands
        if (brand) {
            const brandIds = await resolveBrandIds(brand);
            if (brandIds.length === 0) {
                return res.status(400).json({ message: `No valid brands found for input` });
            }
            category.brands = brandIds;
        }

        if (name && name !== category.name) {
            category.name = name;
            category.slug = await generateUniqueSlug(name);
        }
        if (description !== undefined) {
            category.description = description;
        }

        if (req.files?.bannerImage && req.files.bannerImage[0]) {
            category.bannerImage = req.files.bannerImage[0].path;
        }
        if (req.files?.thumbnailImage && req.files.thumbnailImage[0]) {
            category.thumbnailImage = req.files.thumbnailImage[0].path;
        }

        await category.save();
        res.json({ message: 'Category updated', category });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};

// Delete category (same as before)
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
