import Product from "../../models/Product.js";


export const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


// export const fetchProducts = async (options = {}) => {
//     const {
//         search,
//         categoryIds = [],
//         brandIds = [],
//         minPrice,
//         maxPrice,
//         discountMin,        // e.g. 20 (20%+)
//         ratingMin,          // e.g. 4 (4+ stars)
//         skinTypes = [],
//         skinConcerns = [],
//         shades = [],
//         formulations = [],
//         finishes = [],
//         ingredients = [],
//         freeFrom = [],
//         gender,
//         ageGroup,
//         occasion,
//         inStock = true,
//         sort = "newest",
//         page = 1,
//         limit = 20,
//     } = options;

//     const match = {};

//     if (search) {
//         match.name = { $regex: escapeRegex(search), $options: "i" };
//     }
//     if (categoryIds.length) match.category = { $in: categoryIds };
//     if (brandIds.length) match.brand = { $in: brandIds };
//     if (minPrice || maxPrice) {
//         match.price = {};
//         if (minPrice) match.price.$gte = minPrice;
//         if (maxPrice) match.price.$lte = maxPrice;
//     }
//     if (discountMin) {
//         match.discountPercent = { $gte: discountMin };
//     }
//     if (ratingMin) {
//         match.rating = { $gte: ratingMin };
//     }
//     if (skinTypes.length) match.skinType = { $in: skinTypes };
//     if (skinConcerns.length) match.skinConcern = { $in: skinConcerns };
//     if (shades.length) match.shade = { $in: shades };
//     if (formulations.length) match.formulation = { $in: formulations };
//     if (finishes.length) match.finish = { $in: finishes };
//     if (ingredients.length) match.ingredients = { $in: ingredients };
//     if (freeFrom.length) match.freeFrom = { $in: freeFrom };
//     if (gender) match.gender = gender;
//     if (ageGroup) match.ageGroup = ageGroup;
//     if (occasion) match.occasion = occasion;
//     if (inStock) match.stock = { $gt: 0 };

//     const sortMap = {
//         newest: { createdAt: -1 },
//         oldest: { createdAt: 1 },
//         price_asc: { price: 1 },
//         price_desc: { price: -1 },
//         discount: { discountPercent: -1 },
//         rating: { rating: -1 },
//         popular: { popularityScore: -1 },
//     };

//     const [aggResult] = await Product.aggregate([
//         { $match: match },
//         { $sort: sortMap[sort] || { createdAt: -1 } },
//         {
//             $facet: {
//                 data: [
//                     { $skip: (page - 1) * limit },
//                     { $limit: limit },
//                 ],
//                 totalArr: [{ $count: "count" }],
//             },
//         },
//     ]);

//     const products = aggResult?.data ?? [];
//     const total = aggResult?.totalArr?.[0]?.count ?? 0;

//     return {
//         products,
//         pagination: {
//             page,
//             limit,
//             total,
//             pages: Math.ceil(total / limit) || 1,
//         },
//     };
// };



export const fetchProducts = async (options = {}) => {
    const {
        search,
        categoryIds = [],
        brandIds = [],
        minPrice,
        maxPrice,
        discountMin,
        ratingMin,
        skinTypes = [],
        skinConcerns = [],
        shades = [],
        formulations = [],
        finishes = [],
        ingredients = [],
        freeFrom = [],
        gender,
        ageGroup,
        occasion,
        inStock = true,
        descendantCategoryIds = [],
        tags = [],
        colorFamilies = [],
        promoOnly = false,
        sort = "newest",
        page = 1,
        limit = 20,
    } = options;

    const match = {};

    if (search) match.name = { $regex: escapeRegex(search), $options: "i" };
    if (categoryIds.length || descendantCategoryIds.length) {
        const allCatIds = [...(categoryIds || []), ...(descendantCategoryIds || [])];
        match.$or = [
            { category: { $in: allCatIds } },
            { categories: { $in: allCatIds } },
        ];
    }
    if (brandIds.length) match.brand = { $in: brandIds };
    if (minPrice || maxPrice) {
        match.price = {};
        if (minPrice) match.price.$gte = minPrice;
        if (maxPrice) match.price.$lte = maxPrice;
    }
    if (discountMin) match.discountPercent = { $gte: discountMin };
    if (ratingMin) match.rating = { $gte: ratingMin };
    if (skinTypes.length) match.skinType = { $in: skinTypes };
    if (skinConcerns.length) match.skinConcern = { $in: skinConcerns };
    if (shades.length) match.shade = { $in: shades };
    if (formulations.length) match.formulation = { $in: formulations };
    if (finishes.length) match.finish = { $in: finishes };
    if (ingredients.length) match.ingredients = { $in: ingredients };
    if (freeFrom.length) match.freeFrom = { $in: freeFrom };
    if (gender) match.gender = gender;
    if (ageGroup) match.ageGroup = ageGroup;
    if (occasion) match.occasion = occasion;
    if (inStock) match.stock = { $gt: 0 };
    if (tags.length) match.tags = { $in: tags };
    if (colorFamilies.length) match.colorFamily = { $in: colorFamilies };
    if (promoOnly) match.hasPromotion = true;

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        price_asc: { price: 1 },
        price_desc: { price: -1 },
        discount: { discountPercent: -1 },
        rating: { rating: -1 },
        popular: { popularityScore: -1 },
        best_seller: { sales: -1 },
        most_reviewed: { reviewCount: -1 },
    };

    const [aggResult] = await Product.aggregate([
        { $match: match },
        { $sort: sortMap[sort] || { createdAt: -1 } },
        {
            $facet: {
                data: [
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                ],
                totalArr: [{ $count: "count" }],
            },
        },
    ]);

    const products = aggResult?.data ?? [];
    const total = aggResult?.totalArr?.[0]?.count ?? 0;

    // ✅ Build user-friendly message
    let message = null;
    if (total === 0) {
        if (search) {
            message = `No products found matching “${search}”. Try adjusting your search.`;
        } else if (brandIds.length || skinTypes.length || minPrice || maxPrice || discountMin || ratingMin) {
            message = "No products found with the selected filters. Please try removing some filters.";
        } else {
            message = "No products available at the moment. Please check back later.";
        }
    }

    return {
        products,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1,
        },
        message, // 👈 new field
    };
};
