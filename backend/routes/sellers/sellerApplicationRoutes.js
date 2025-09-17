import express from "express";
import { applySeller, approveSeller, rejectSellerApplication } from "../../controllers/sellers/sellerApplicationController.js";
import { uploadSeller } from "../../middlewares/upload.js";
import { isAdmin } from "../../middlewares/authMiddleware.js";

const router = express.Router();

// Submit seller application (with files)
router.post(
    "/apply",
    uploadSeller.any(),
    applySeller
);

// Approve seller (admin only)
router.patch("/approve/:id", isAdmin, approveSeller);

router.patch("/reject/:id", isAdmin, rejectSellerApplication);

export default router;
