// routes/user/userMediaRoutes.js
import express from "express";
import { listPublicMedia ,uploadVideoController,getMediaById,updateMedia,deleteMedia} from "../controllers/mediaController.js";
import { isAdmin } from "../middlewares/authMiddleware.js";
import { uploadMedia } from "../middlewares/upload.js";

const router = express.Router();

// ✅ Users can view all uploaded media (both image & video)
router.get("/", listPublicMedia);
router.post('/upload', isAdmin, uploadMedia.single("file"), uploadVideoController);
router.get("/:id", isAdmin, getMediaById);
router.put("/:id", isAdmin, uploadMedia.single("file"), updateMedia);
router.delete("/:id", isAdmin, deleteMedia);

export default router;
