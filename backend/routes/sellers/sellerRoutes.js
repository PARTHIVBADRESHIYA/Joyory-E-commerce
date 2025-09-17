// // routes/sellerRoutes.js
// import express from "express";
// import { uploadSeller, uploadProduct } from "../../middlewares/upload.js";
// import { authenticateSeller ,isAdmin} from "../../middlewares/authMiddleware.js";

// import {
//     uploadKyc,
//     uploadLicences,
//     getSellerProfile,
//     updateSeller,
//     listSellerOrders,
//     shipOrder,
//     getPayouts,
//     requestPayout,
//     addProductBySeller,
//     listSellerProducts,
//     updateProductBySeller,
//     approveLicence
// } from "../../controllers/sellers/sellerController.js";

// const router = express.Router();

// /* ================= Seller KYC ================= */
// router.post(
//     "/kyc",
//     authenticateSeller,
//     uploadSeller.array("kycDocs", 5), // up to 5 KYC documents
//     uploadKyc
// );

// /* ================= Seller Licences ================= */
// router.post(
//     "/licences",
//     authenticateSeller,
//     uploadSeller.single("licenceDoc"), // one licence doc per category
//     uploadLicences
// );

// /* ================= Seller Products ================= */
// router.post(
//     "/products",
//     authenticateSeller,
//     uploadProduct.array("images", 5), // up to 5 product images
//     addProductBySeller
// );

// router.get("/products", authenticateSeller, listSellerProducts);

// router.put(
//     "/products/:id",
//     authenticateSeller,
//     uploadProduct.array("images", 5),
//     updateProductBySeller
// );

// /* ================= Seller Profile ================= */
// router.get("/me", authenticateSeller, getSellerProfile);
// router.put("/me", authenticateSeller, updateSeller);

// /* ================= Seller Orders ================= */
// router.get("/orders", authenticateSeller, listSellerOrders);
// router.post("/orders/:orderId/ship", authenticateSeller, shipOrder);

// /* ================= Seller Payouts ================= */
// router.get("/payouts", authenticateSeller, getPayouts);
// router.post("/payouts/request", authenticateSeller, requestPayout);

// /* ================= Seller Approve Licence ================= */
// router.post("/:sellerId/licences/:licenceId/approve", isAdmin, approveLicence);
// export default router;





























// routes/sellers/sellerRoutes.js
import express from "express";
import { uploadSeller } from "../../middlewares/upload.js";
import { authenticateSeller, isAdmin } from "../../middlewares/authMiddleware.js";
import {
    uploadKyc,
    uploadLicences,
    getSellerProfile,
    updateSeller,
    approveLicence
} from "../../controllers/sellers/sellerController.js";

const router = express.Router();

/* ================= Seller KYC ================= */
router.post(
    "/kyc",
    authenticateSeller,
    uploadSeller.array("kycDocs", 5),
    uploadKyc
);

/* ================= Seller Licences ================= */
router.post(
    "/licences",
    authenticateSeller,
    uploadSeller.single("licenceDoc"),
    uploadLicences
);

/* ================= Seller Profile ================= */
router.get("/me", authenticateSeller, getSellerProfile);
router.put("/me", authenticateSeller, updateSeller);

/* ================= Seller Approve Licence (Admin) ================= */
router.post("/:sellerId/licences/:licenceId/approve", isAdmin, approveLicence);

export default router;
