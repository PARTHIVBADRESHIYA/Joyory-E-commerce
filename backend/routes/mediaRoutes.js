// routes/user/userMediaRoutes.js
import express from "express";
import { listPublicMedia ,uploadVideoController} from "../controllers/MediaController.js";
import { isAdmin } from "../middlewares/authMiddleware.js";
import { uploadMedia } from "../middlewares/upload.js";

const router = express.Router();

// ✅ Users can view all uploaded media (both image & video)
router.get("/", listPublicMedia);
router.post('/upload', isAdmin, uploadMedia.single("file"), uploadVideoController);

export default router;
