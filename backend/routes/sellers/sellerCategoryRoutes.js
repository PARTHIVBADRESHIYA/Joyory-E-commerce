import express from "express";
import { authenticateSeller } from "../../middlewares/authMiddleware.js";
import { sellerDashboard, getSellerLicences, uploadLicence } from "../../controllers/sellers/sellerCategoryController.js";
import {uploadSeller} from "../../middlewares/upload.js";

const router = express.Router();

// ================= SELLER DASHBOARD =================
// GET /api/seller/dashboard
router.get("/dashboard", authenticateSeller, sellerDashboard);

// ================= GET CURRENT LICENCES & AVAILABLE CATEGORIES =================
// GET /api/seller/dashboard/licences
router.get("/licences", authenticateSeller, getSellerLicences);

// ================= UPLOAD NEW LICENCE =================
// POST /api/seller/dashboard/licences/upload
router.post("/licences/upload", authenticateSeller, uploadSeller.single("file"), uploadLicence);

export default router;
