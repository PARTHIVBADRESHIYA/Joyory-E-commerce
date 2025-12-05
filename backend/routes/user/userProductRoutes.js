// routes/user/userProductRoutes.js
import express from "express";
import {
    getAllProducts,
    getSingleProduct,
    getProductsByCategory,
    getTopSellingProducts,
    getTopCategories,
    getProductsBySkinType,
    getAllSkinTypes,
    getFilterMetadata
} from "../../controllers/user/userProductController.js";

import {optionalAuth} from "../../middlewares/authMiddleware.js";
import {
    productListRateLimiter,
    productDetailRateLimiter,
} from "../../middlewares/security/rateLimiter.js";

import {
    productQuerySchema,
    productDetailQuerySchema,
} from "../../middlewares/validations/productQueryValidation.js";
import { validate } from "../../middlewares/validations/validate.js";

const router = express.Router();

// ✅ Filter metadata
router.get("/filters", getFilterMetadata);

// ✅ Product list (static routes first!)
router.get("/all", productListRateLimiter, validate(productQuerySchema), getAllProducts);

// ✅ Top sellers & top categories (static routes first!)
router.get("/skin-types", getAllSkinTypes);
router.get("/top-sellers", getTopSellingProducts);
router.get("/top-categories", getTopCategories);

// ✅ Product by category
router.get("/category/:slug/products",optionalAuth, getProductsByCategory);

// ✅ Products by skin type (use a distinct prefix to avoid conflicts)
router.get("/skintype/:slug", validate(productQuerySchema), getProductsBySkinType);

// ✅ Single product details (dynamic routes last!)
router.get(
    "/:idOrSlug",
    optionalAuth,
    productDetailRateLimiter,
    validate(productDetailQuerySchema),
    getSingleProduct
);

export default router;
