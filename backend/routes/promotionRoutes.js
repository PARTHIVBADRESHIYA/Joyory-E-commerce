import express from "express";
import {
  createPromotion,
  getPromotionById,
  updatePromotion,
  deletePromotion,
  getPromotionSummary,
  getPromotionList,
} from "../controllers/promotionController.js";

import { uploadProduct } from '../middlewares/upload.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post("/", verifyAdminOrTeamMember,uploadProduct.array('images', 5), createPromotion);
router.get("/summary",verifyAdminOrTeamMember, getPromotionSummary);
router.get("/",verifyAdminOrTeamMember, getPromotionList);
router.get("/:id",verifyAdminOrTeamMember, getPromotionById);        // Create new promotion
router.put("/:id",verifyAdminOrTeamMember, uploadProduct.array('images', 5), updatePromotion);        // Update promotion
router.delete("/:id", verifyAdminOrTeamMember,deletePromotion);     // Delete promotion

export default router;
