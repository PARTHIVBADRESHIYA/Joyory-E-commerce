import mongoose from "mongoose";
// controllers/user/categoryController.js
import Category from '../../models/Category.js';
import Product from '../../models/Product.js';
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
