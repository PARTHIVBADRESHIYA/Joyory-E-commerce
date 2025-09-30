// routes/user/userProductRoutes.js
import express from "express";
import {
    getAllFilteredProducts,
    getSingleProduct,
    getProductsByCategory,
    getTopSellingProducts,
    getProductWithRelated,
    getTopCategories,
    getProductsBySkinType,
    getTopSellingProductsByCategory ,
    getAllSkinTypes
} from "../../controllers/user/userProductController.js";

import {
    productListRateLimiter,
    productDetailRateLimiter, 
} from "../../middlewares/security/rateLimiter.js";

import {
    productQuerySchema,
    productDetailQuerySchema,
} from "../../middlewares/validations/productQueryValidation.js";
import { validate } from "../../middlewares/validations/validate.js";
import { protect } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// ✅ Filtered product list
router.get(
    "/",
    productListRateLimiter,
    
    validate(productQuerySchema),
    getAllFilteredProducts
);

// ✅ Top sellers & top categories (static routes first!)
router.get("/top-selling-by-category", getTopSellingProductsByCategory);
router.get("/skin-types", getAllSkinTypes);
router.get("/top-sellers", getTopSellingProducts);
router.get("/top-categories", getTopCategories);

// ✅ Product by category
router.get("/category/:slug/products", getProductsByCategory);

// ✅ Products by skin type (use a distinct prefix to avoid conflicts)
router.get("/skintype/:slug",  validate(productQuerySchema), getProductsBySkinType);

// ✅ Related product info
router.get("/top-sellers/:id", getProductWithRelated);

// ✅ Single product details (dynamic routes last!)
router.get(
    "/:id",
    productDetailRateLimiter,
    validate(productDetailQuerySchema),
    getSingleProduct
);

export default router;
