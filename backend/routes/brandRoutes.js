// routes/admin/brandAdminRoutes.js
import express from "express";
import {
    createBrand,
    updateBrand,
    deleteBrand,
    getAllBrandsAdmin,
} from "../controllers/brandController.js";
import { uploadBrand } from "../middlewares/upload.js";  // cloudinary uploader
import { isAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Admin CRUD for brands
router.post("/", isAdmin, uploadBrand.fields([{ name: "logo" }, { name: "banner" }]), createBrand);
router.put("/:id", isAdmin, uploadBrand.fields([{ name: "logo" }, { name: "banner" }]), updateBrand);
router.delete("/:id", isAdmin, deleteBrand);
router.get("/", isAdmin, getAllBrandsAdmin);

export default router;
