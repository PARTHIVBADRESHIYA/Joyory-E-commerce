// // validations/promotionValidation.js
// import Joi from "joi";
// import mongoose from "mongoose";

// // helper to validate ObjectId
// const objectId = (value, helpers) => {
//     if (!mongoose.Types.ObjectId.isValid(value)) return helpers.error("any.invalid");
//     return value;
// };

// export const promotionSchema = Joi.object({
//     campaignName: Joi.string().trim().required(),
//     description: Joi.string().allow("", null),

//     promotionType: Joi.string().valid(
//         "discount",
//         "tieredDiscount",
//         "bogo",
//         "bundle",
//         "newUser",
//         "paymentOffer",
//         "cartValue",
//         "gift",
//         "freeShipping"
//     ).required(),

//     scope: Joi.string().valid("product", "category", "brand", "global").default("product"),

//     discountUnit: Joi.string().valid("percent", "amount").when("promotionType", {
//         is: "discount",
//         then: Joi.required(),
//     }),
//     discountValue: Joi.number().min(0).when("promotionType", {
//         is: "discount",
//         then: Joi.required(),
//     }),

//     startDate: Joi.date().required(),
//     endDate: Joi.date().required(),

//     status: Joi.string().valid("active", "inactive").default("active"),
//     targetAudience: Joi.string().valid("all", "newUsers", "loyalCustomers").default("all"),

//     // relations
//     products: Joi.array().items(Joi.custom(objectId)).default([]),
//     categories: Joi.array().items(Joi.custom(objectId)).default([]),
//     brands: Joi.array().items(Joi.custom(objectId)).default([]),

//     // common config
//     promotionConfig: Joi.object({
//         // --- tieredDiscount ---
//         tiers: Joi.array().items(
//             Joi.object({
//                 minQty: Joi.number().min(1).required(),
//                 discountPercent: Joi.number().min(0).max(100).required(),
//                 extraPercent: Joi.number().min(0).max(100).optional(),
//             })
//         ),
//         tierScope: Joi.string().valid("perProduct", "perOrder"),
//         sameProduct: Joi.boolean(),
//         freeProductId: Joi.custom(objectId).allow(null),

//         // --- bogo ---
//         buyQty: Joi.number().min(1),
//         getQty: Joi.number().min(1),

//         // --- bundle ---
//         bundleProducts: Joi.array().items(Joi.custom(objectId)),
//         bundlePrice: Joi.number().min(0),

//         // --- paymentOffer ---
//         methods: Joi.array().items(Joi.string().trim()),
//         minOrderValue: Joi.number().min(0),
//         discountPercent: Joi.number().min(0).max(100),
//         maxDiscount: Joi.number().min(0),

//         // --- cartValue ---
//         minCartValue: Joi.number().min(0),
//         discountPercentCart: Joi.number().min(0).max(100),

//         // --- gift ---
//         giftProduct: Joi.custom(objectId),

//         // --- freeShipping ---
//         minOrderValueForFreeShip: Joi.number().min(0)
//     }).default({}),

//     // optional conditions (for filtering)
//     conditions: Joi.object({
//         isBestSeller: Joi.boolean(),
//         minRating: Joi.number().min(0).max(5),
//         tags: Joi.array().items(Joi.string()),
//         categoryIds: Joi.array().items(Joi.custom(objectId)),
//         brandIds: Joi.array().items(Joi.custom(objectId))
//     }).default({}),

//     allowStacking: Joi.boolean().default(false),
//     tags: Joi.array().items(Joi.string().trim()).default([]),
//     displaySection: Joi.array().items(Joi.string().trim()).default([]),
// });




// validations/promotionValidation.js
import Joi from "joi";
import mongoose from "mongoose";

const objectId = (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value))
        return helpers.error("any.invalid");
    return value;
};

export const promotionSchema = Joi.object({
    campaignName: Joi.string().trim().required(),
    description: Joi.string().allow("", null),

    promotionType: Joi.string()
        .valid(
            "discount",
            "tieredDiscount",
            "bogo",
            "bundle",
            "gift",
            "freeShipping",
            "newUser",
            "paymentOffer",
            "cartValue"
        )
        .required(),

    scope: Joi.string().valid("product", "category", "brand", "global").default("product"),

    discountUnit: Joi.string().valid("percent", "amount").optional(),
    discountValue: Joi.number().min(0).optional(),

    startDate: Joi.date().required(),
    endDate: Joi.date().required(),

    status: Joi.string().valid("active", "inactive", "upcoming", "expired").default("inactive"),
    targetAudience: Joi.string().valid("all", "newUsers", "loyalCustomers").default("all"),

    products: Joi.array().items(Joi.custom(objectId)).default([]),
    categories: Joi.array().items(Joi.custom(objectId)).default([]),
    brands: Joi.array().items(Joi.custom(objectId)).default([]),

    promotionConfig: Joi.object({
        // --- bogo ---
        sameProduct: Joi.boolean().default(true),
        requiredQty: Joi.number().min(1),
        freeQty: Joi.number().min(1),
        freeProductId: Joi.custom(objectId).allow(null),

        // --- tieredDiscount ---
        tiers: Joi.array().items(
            Joi.object({
                minQty: Joi.number().min(1).required(),
                discountPercent: Joi.number().min(0).max(100).required(),
                extraPercent: Joi.number().min(0).max(100).optional(),
            })
        ),

        // --- bundle ---
        bundleProducts: Joi.array().items(Joi.custom(objectId)),
        bundlePrice: Joi.number().min(0),

        // --- paymentOffer ---
        methods: Joi.array().items(Joi.string().trim()),
        minOrderValue: Joi.number().min(0),
        discountPercent: Joi.number().min(0).max(100),
        maxDiscount: Joi.number().min(0),

        // --- cartValue ---
        minCartValue: Joi.number().min(0),
        discountPercentCart: Joi.number().min(0).max(100),

        // --- freeShipping ---
        minOrderValueForFreeShip: Joi.number().min(0),
    }).default({}),


    conditions: Joi.object({
        isBestSeller: Joi.boolean(),
        minRating: Joi.number().min(0).max(5),
        tags: Joi.array().items(Joi.string()),
    }).default({}),

    allowStacking: Joi.boolean().default(false),
    tags: Joi.array().items(Joi.string().trim()).default([]),
    displaySection: Joi.array()
        .items(Joi.string().valid("banner", "product", "offers"))
        .default(["offers"]),
});
