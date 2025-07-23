import express from 'express';
import { createPromotion, getPromotionSummary, getPromotionList } from './../controllers/promotionController.js';
import { verifyAdminOrTeamMember } from './../middlewares/authMiddleware.js';
import upload from './../middlewares/upload.js';


const router = express.Router();

router.post('/', verifyAdminOrTeamMember, createPromotion);
router.get('/summary', verifyAdminOrTeamMember, getPromotionSummary);
router.get('/list', verifyAdminOrTeamMember, getPromotionList);


router.post(
  '/', verifyAdminOrTeamMember,
  upload.array('banners', 5),
  createPromotion
);

export default router;
