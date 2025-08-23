// utils/categoryUtils.js
import Category from '../../models/Category.js';
import mongoose from 'mongoose';


export const buildCategoryHierarchy = (categories, maxDepth = Infinity) => {
    const plainCats = categories.map(cat =>
        typeof cat.toObject === 'function' ? cat.toObject() : cat
    );

    const map = new Map(
        plainCats.map(c => [c._id.toString(), { ...c, subCategories: [] }])
    );

    const roots = [];
    for (const cat of plainCats) {
        if (cat.parent && map.has(cat.parent.toString())) {
            const parent = map.get(cat.parent.toString());
            parent.subCategories.push(map.get(cat._id.toString()));
        } else {
            roots.push(map.get(cat._id.toString()));
        }
    }

    // Apply depth filtering if needed
    if (maxDepth !== Infinity) {
        const limitDepth = (nodes, depth) => {
            if (depth >= maxDepth) {
                return nodes.map(({ subCategories, ...rest }) => ({ ...rest, subCategories: [] }));
            }
            return nodes.map(node => ({
                ...node,
                subCategories: limitDepth(node.subCategories, depth + 1)
            }));
        };
        return limitDepth(roots, 1);
    }

    return roots;
};



export const getDescendantCategoryIds = async (categoryId) => {
    // Defensive: don't try to cast invalid ids
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return [];
    }

    const ids = new Set([categoryId.toString()]);
    let toSearch = [new mongoose.Types.ObjectId(categoryId)];

    while (toSearch.length) {
        const children = await Category.find(
            { parent: { $in: toSearch } },
            { _id: 1 }
        ).lean();

        toSearch = children.map(ch => ch._id);
        children.forEach(ch => ids.add(ch._id.toString()));
    }
    return Array.from(ids);
};