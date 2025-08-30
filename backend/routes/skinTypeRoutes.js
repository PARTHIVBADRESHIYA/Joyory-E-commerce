import express from "express";// routes/admin/skinTypeRoutes.js

import {
    createSkinType,
    listSkinTypes,
    getSkinTypeById,
    updateSkinType,
    toggleSkinType,
    softDeleteSkinType,
    restoreSkinType,
} from "../controllers/skinTypeController.js";
import { isAdmin } from "../middlewares/authMiddleware.js";

import { uploadSkinType } from "../middlewares/upload.js";

const router = express.Router();

// assumes you already run a verifyJWT middleware before this router to set req.user
router.post("/", isAdmin,uploadSkinType.fields([{ name: "image", maxCount: 1 }]), createSkinType);
router.get("/", isAdmin, listSkinTypes);
router.get("/:id", isAdmin, getSkinTypeById);
router.put("/:id", isAdmin,uploadSkinType.fields([{ name: "image", maxCount: 1 }]), updateSkinType);
router.patch("/:id/toggle", isAdmin, toggleSkinType);
router.delete("/:id", isAdmin, softDeleteSkinType);
router.patch("/:id/restore", isAdmin, restoreSkinType);

export default router;