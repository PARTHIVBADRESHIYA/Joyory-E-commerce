// routes/sellers/sellerProductRoutes.js
import express from "express";
import { uploadProduct } from "../../middlewares/upload.js";
import { authenticateSeller } from "../../middlewares/authMiddleware.js";
import {
    addProductBySeller,
    listSellerProducts,
    updateProductBySeller,
    getSellerProductById,
    updateSellerProductStock,
    deleteSellerProduct,
    updateSellerVariantImages
} from "../../controllers/sellers/sellerProductController.js";

const router = express.Router();

/* ================= Seller Products ================= */

// Add a new product (with images, license & pending status)
router.post(
    "/",
    authenticateSeller,
    uploadProduct.array("images", 5),
    addProductBySeller
);

// List all seller products (dashboard-ready)
router.get("/", authenticateSeller, listSellerProducts);

// Get single product by ID
router.get("/:id", authenticateSeller, getSellerProductById);

// Update product by seller (with images)
router.put(
    "/:id",
    authenticateSeller,
    uploadProduct.array("images", 5),
    updateProductBySeller
);

// Update product stock separately
router.put("/stock/:id", authenticateSeller, updateSellerProductStock);

// Delete product
router.delete("/:id", authenticateSeller, deleteSellerProduct);

// Update variant images
router.put(
    "/variant-images/:id/:sku",
    authenticateSeller,
    uploadProduct.array("images", 5),
    updateSellerVariantImages
);

export default router;
