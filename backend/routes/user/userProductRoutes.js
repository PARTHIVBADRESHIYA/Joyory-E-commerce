// routes/user/userProductRoutes.js
import express from "express";
import {
    getAllFilteredProducts,
    getSingleProduct,
    getProductsByCategory,
    getTopSellingProducts,
    getProductWithRelated,
    getTopCategories
} from "../../controllers/user/userProductController.js";

import {
    productListRateLimiter,
    productDetailRateLimiter,
} from "../../middlewares/security/rateLimiter.js";

import { cacheMiddleware } from "../../middlewares/cacheMiddleware.js";
import {
    productQuerySchema,
    productDetailQuerySchema,
} from "../../middlewares/validations/productQueryValidation.js";
import { validate } from "../../middlewares/validations/validate.js";
import { protect } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.get(
    "/",
    productListRateLimiter,
    cacheMiddleware,
    validate(productQuerySchema),
    getAllFilteredProducts
);

router.get("/category/:slug/products", getProductsByCategory);

router.get("/top-sellers", getTopSellingProducts);

router.get("/top-categories", getTopCategories);

router.get("/top-sellers/:id", getProductWithRelated);

router.get(
    "/:id",
    productDetailRateLimiter,
    validate(productDetailQuerySchema),
    getSingleProduct
);

export default router;
