import express from "express";
import {
  createPromotion,
  updatePromotion,
  deletePromotion,
  getPromotionSummary,
  getPromotionList,
} from "../controllers/promotionController.js";

const router = express.Router();

router.post("/", createPromotion);          // Create new promotion
router.put("/:id", updatePromotion);        // Update promotion
router.delete("/:id", deletePromotion);     // Delete promotion
router.get("/summary", getPromotionSummary);
router.get("/", getPromotionList);

export default router;
