import express from 'express';
import { applyAsAffiliate, generateLink, trackReferralClick, getAllAffiliates, updateAffiliateStatus, getPopularProducts, getProductActivity , trackCustomReferralClick} from '../controllers/affiliateController.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/apply', protect, applyAsAffiliate);
router.post('/generate-link', protect, generateLink);
router.get('/track', trackCustomReferralClick);
router.get('/track/:productId', trackReferralClick); // for product links
router.get('/admin/all', isAdmin, getAllAffiliates);
router.put('/admin/update/:id', isAdmin, updateAffiliateStatus);
router.get('/popular', isAdmin, getPopularProducts);
router.get('/activity', isAdmin, getProductActivity);


export default router;
