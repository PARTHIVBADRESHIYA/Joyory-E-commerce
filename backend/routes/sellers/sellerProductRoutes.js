// routes/sellers/sellerProductRoutes.js
import express from "express";
import { uploadProduct } from "../../middlewares/upload.js";
import { authenticateSeller } from "../../middlewares/authMiddleware.js";
import {
    addProductBySeller,
    listSellerProducts,
    updateProductBySeller
} from "../../controllers/sellers/sellerProductController.js";

const router = express.Router();

/* ================= Seller Products ================= */
router.post(
    "/",
    authenticateSeller,
    uploadProduct.array("images", 5),
    addProductBySeller
);

router.get("/", authenticateSeller, listSellerProducts);

router.put(
    "/:id",
    authenticateSeller,
    uploadProduct.array("images", 5),
    updateProductBySeller
);

export default router;
