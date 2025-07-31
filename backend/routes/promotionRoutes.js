import express from 'express';
import { createPromotion, getPromotionSummary, getPromotionList } from './../controllers/promotionController.js';
import { verifyAdminOrTeamMember } from './../middlewares/authMiddleware.js';
import { uploadPromotion } from '../middlewares/upload.js';

const router = express.Router();

router.post('/', verifyAdminOrTeamMember, createPromotion);
router.get('/summary', verifyAdminOrTeamMember, getPromotionSummary);
router.get('/list', verifyAdminOrTeamMember, getPromotionList);


router.post(
  '/', verifyAdminOrTeamMember,
  uploadPromotion.array('banners', 5),
  createPromotion
);

export default router;
