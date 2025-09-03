import express from "express";
import {
    createGiftCardTemplate,
    getAllGiftCardTemplates,
    updateGiftCardTemplate,
    deleteGiftCardTemplate
} from "../controllers/giftCardTemplateController.js";

import { isAdmin } from "../middlewares/authMiddleware.js";
import { uploadGiftCard } from "../middlewares/upload.js";

const router = express.Router();

// ✅ Create template
router.post("/", isAdmin, uploadGiftCard.single("image"), createGiftCardTemplate);

// ✅ Get all templates
router.get("/", isAdmin, getAllGiftCardTemplates);

// ✅ Update template
router.put("/:id", isAdmin, uploadGiftCard.single("image"), updateGiftCardTemplate);

// ✅ Delete template
router.delete("/:id", isAdmin, deleteGiftCardTemplate);

export default router;
