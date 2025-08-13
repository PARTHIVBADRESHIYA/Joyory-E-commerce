import mongoose from "mongoose";
// controllers/user/categoryController.js
import Category from '../../models/Category.js';
import { buildCategoryHierarchy } from '../../middlewares/utils/categoryUtils.js';

export const getCategoryTree = async (req, res) => {
    try {
        const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth, 10) : null;

        if (maxDepth && maxDepth < 1) {
            return res.status(400).json({ message: 'maxDepth must be >= 1' });
        }

        const categories = await Category.find(
            { isActive: true },
            { _id: 1, name: 1, slug: 1, parent: 1, bannerImage: 1, thumbnailImage: 1 }
        ).sort({ name: 1 }).lean();

        let tree = buildCategoryHierarchy(categories);

        const cleanTree = (nodes, depth = 1) => {
            return nodes.map(({ _id, name, slug, bannerImage, thumbnailImage, subCategories }) => ({
                _id,
                name,
                slug,
                bannerImage,
                thumbnailImage,
                subCategories:
                    maxDepth && depth >= maxDepth
                        ? []
                        : (subCategories && subCategories.length > 0
                            ? cleanTree(subCategories, depth + 1)
                            : [])
            }));
        };

        res.json(cleanTree(tree));
    } catch (err) {
        console.error("❌ getCategoryTree error:", err);
        res.status(500).json({ message: err.message });
    }
};



export const getCategoryByIdOrSlug = async (req, res) => {
    try {
        const identifier = req.params.slugOrId;
        let category;

        if (mongoose.isValidObjectId(identifier)) {
            category = await Category.findById(identifier)
                .select('name slug bannerImage thumbnailImage ancestors');
        } else {
            category = await Category.findOne({ slug: identifier })
                .select('name slug bannerImage thumbnailImage ancestors');
        }


        if (!category) return res.status(404).json({ message: 'Category not found' });

        let ancestors = [];
        ancestors = allObjectIds
            ? await Category.find({ _id: { $in: category.ancestors } })
                .sort({ createdAt: 1 })
                .select('name slug bannerImage thumbnailImage')
            : await Category.find({ slug: { $in: category.ancestors } })
                .sort({ createdAt: 1 })
                .select('name slug bannerImage thumbnailImage');

        res.json({ category, breadcrumb: ancestors });
    } catch (err) {
        console.error("❌ getCategoryByIdOrSlug error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

