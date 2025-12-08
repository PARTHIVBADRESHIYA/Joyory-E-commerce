// // utils/categoryUtils.js
// import Category from '../../models/Category.js';
// import mongoose from 'mongoose';


// export const buildCategoryHierarchy = (categories, maxDepth = Infinity) => {
//     const plainCats = categories.map(cat =>
//         typeof cat.toObject === 'function' ? cat.toObject() : cat
//     );

//     const map = new Map(
//         plainCats.map(c => [c._id.toString(), { ...c, subCategories: [] }])
//     );

//     const roots = [];
//     for (const cat of plainCats) {
//         if (cat.parent && map.has(cat.parent.toString())) {
//             const parent = map.get(cat.parent.toString());
//             parent.subCategories.push(map.get(cat._id.toString()));
//         } else {
//             roots.push(map.get(cat._id.toString()));
//         }
//     }

//     // Apply depth filtering if needed
//     if (maxDepth !== Infinity) {
//         const limitDepth = (nodes, depth) => {
//             if (depth >= maxDepth) {
//                 return nodes.map(({ subCategories, ...rest }) => ({ ...rest, subCategories: [] }));
//             }
//             return nodes.map(node => ({
//                 ...node,
//                 subCategories: limitDepth(node.subCategories, depth + 1)
//             }));
//         };
//         return limitDepth(roots, 1);
//     }

//     return roots;
// };



// export const getDescendantCategoryIds = async (categoryId) => {
//     // Defensive: don't try to cast invalid ids
//     if (!mongoose.Types.ObjectId.isValid(categoryId)) {
//         return [];
//     }

//     const ids = new Set([categoryId.toString()]);
//     let toSearch = [new mongoose.Types.ObjectId(categoryId)];

//     while (toSearch.length) {
//         const children = await Category.find(
//             { parent: { $in: toSearch } },
//             { _id: 1 }
//         ).lean();

//         toSearch = children.map(ch => ch._id);
//         children.forEach(ch => ids.add(ch._id.toString()));
//     }
//     return Array.from(ids);
// };



// // utils/categoryUtils.js
// export const getCategoryFallbackChain = async (categoryDoc) => {
//     const chain = [];
//     let current = categoryDoc;

//     while (current) {
//         chain.push(current);
//         if (!current.parent) break;
//         current = await Category.findById(current.parent)
//             .select("_id name slug thumbnailImage parent")
//             .lean();
//     }
//     return chain; // child → parent → parent …
// };




// utils/categoryUtils.js
import Category from '../../models/Category.js';
import mongoose from 'mongoose';
import {getRedis} from './redis.js'; // your Redis instance

/**
 * Build category hierarchy from a flat list
 */
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
            map.get(cat.parent.toString()).subCategories.push(map.get(cat._id.toString()));
        } else {
            roots.push(map.get(cat._id.toString()));
        }
    }

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


/**
 * Get all descendant category IDs including itself
 * ⚡ Optimized with Redis cache
 */
export const getDescendantCategoryIds = async (categoryId) => {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) return [];

    const redis = getRedis();  // 🔥 REQUIRED
    const redisKey = `categoryDescendants:${categoryId}`;
    const cached = await redis.get(redisKey);
    if (cached) {
        return JSON.parse(cached); // ✅ Cache HIT
    }

    // Batch fetch all categories at once
    const allCategories = await Category.find({}, "_id parent").lean();
    const map = new Map(allCategories.map(c => [c._id.toString(), c.parent?.toString() || null]));

    const ids = new Set([categoryId.toString()]);

    const stack = [categoryId.toString()];
    while (stack.length) {
        const current = stack.pop();
        for (const [id, parent] of map.entries()) {
            if (parent === current && !ids.has(id)) {
                ids.add(id);
                stack.push(id);
            }
        }
    }

    const result = Array.from(ids);

    // Cache for 5 minutes
    await redis.set(redisKey, JSON.stringify(result), "EX", 300);

    return result;
};


/**
 * Get category fallback chain (child → parent → root)
 * ⚡ Optimized with Redis cache & batch fetching
 */
export const getCategoryFallbackChain = async (categoryDoc) => {
    if (!categoryDoc?._id) return [];

    const redis = getRedis();  // 🔥 REQUIRED

    const redisKey = `categoryFallbackChain:${categoryDoc._id}`;
    const cached = await redis.get(redisKey);
    if (cached) return JSON.parse(cached); // ✅ Cache HIT

    // Batch fetch all categories once
    const allCategories = await Category.find({}, "_id name slug thumbnailImage parent").lean();
    const map = new Map(allCategories.map(c => [c._id.toString(), c]));

    const chain = [];
    let current = categoryDoc;
    while (current) {
        chain.push(current);
        if (!current.parent) break;
        current = map.get(current.parent.toString()) || null;
    }

    // Cache for 5 minutes
    await redis.set(redisKey, JSON.stringify(chain), "EX", 300);

    return chain;
};
