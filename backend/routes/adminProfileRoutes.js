import express from "express";
import {
    getAdminProfile,
    updateAdminProfile,
    updateAdminProfileImage,
    removeAdminProfileImage
    
} from "../controllers/adminProfileController.js";
import { verifyAdminOrTeamMember } from "../middlewares/authMiddleware.js";
import {uploadAdminProfile} from "../middlewares/upload.js";
const router = express.Router();

router.get("/me", verifyAdminOrTeamMember, getAdminProfile);
router.put("/update", verifyAdminOrTeamMember, updateAdminProfile);
router.put("/update-image", verifyAdminOrTeamMember, uploadAdminProfile.single('image'), updateAdminProfileImage);
router.delete("/remove-image", verifyAdminOrTeamMember, removeAdminProfileImage);

export default router;
