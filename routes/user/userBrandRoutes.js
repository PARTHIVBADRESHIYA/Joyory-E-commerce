// routes/brandRoutes.js
import express from "express";
import {
    getAllBrands,
    getBrandLanding,
    getBrandCategoryProducts
} from "../../controllers/user/userBrandController.js";

const router = express.Router();

// /api/brands
router.get("/", getAllBrands);

// /api/brands/mamaearth   OR /api/brands/66ce6d8c4f9b0a4f3c9b4a12
router.get("/:brandSlug", getBrandLanding);

// /api/brands/mamaearth/facecare  OR /api/brands/66ce6d8c.../66ce6e4...
router.get("/:brandSlug/:categorySlug", getBrandCategoryProducts);

export default router;
