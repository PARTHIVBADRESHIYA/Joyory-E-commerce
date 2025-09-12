













import express from "express";
import { uploadSeller, uploadProduct } from "../middlewares/upload.js";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSeller } from "../middlewares/sellerMiddleware.js";

import {
    registerSeller,
    uploadKyc,
    getSellerProfile,
    updateSeller,
    listSellerOrders,
    shipOrder,
    getPayouts,
    requestPayout,
    addProductBySeller,
    listSellerProducts,
    updateProductBySeller,
} from "../controllers/sellerController.js";

const router = express.Router();

// ================= Seller Onboarding =================
router.post("/apply", protect, registerSeller);
router.post("/kyc", protect, uploadSeller.array("kycDocs", 5), uploadKyc);

// ================= Seller Products =================
router.post(
    "/products",
    protect,
    requireActiveSeller,
    uploadProduct.array("images", 5), // allow up to 5 images
    addProductBySeller
);
router.get("/products", protect, requireActiveSeller, listSellerProducts);
router.put(
    "/products/:id",
    protect,
    requireActiveSeller,
    uploadProduct.array("images", 5),
    updateProductBySeller
);

// ================= Seller Profile =================
router.get("/me", protect, getSellerProfile);
router.put("/me", protect, updateSeller);

// ================= Seller Orders =================
router.get("/orders", protect, requireActiveSeller, listSellerOrders);
router.post("/orders/:orderId/ship", protect, requireActiveSeller, shipOrder);

// ================= Seller Payouts =================
router.get("/payouts", protect, requireActiveSeller, getPayouts);
router.post("/payouts/request", protect, requireActiveSeller, requestPayout);

export default router;
