    import express from "express";
    import {
      createPromotion,
      updatePromotion,
      deletePromotion,
      getPromotionSummary,
      getPromotionList,
    } from "../controllers/promotionController.js";

    import { uploadProduct } from '../middlewares/upload.js';

    const router = express.Router();

    router.post("/",uploadProduct.array('images', 5), createPromotion);          // Create new promotion
    router.put("/:id",uploadProduct.array('images', 5), updatePromotion);        // Update promotion
    router.delete("/:id", deletePromotion);     // Delete promotion
    router.get("/summary", getPromotionSummary);
    router.get("/", getPromotionList);

    export default router;
