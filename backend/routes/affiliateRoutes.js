// import express from 'express';
// import { applyAsAffiliate, generateLink, trackReferralClick, getAllAffiliates, updateAffiliateStatus, getPopularProducts, getProductActivity , trackCustomReferralClick} from '../controllers/affiliateController.js';
// import { protect, isAdmin } from '../middlewares/authMiddleware.js';

// const router = express.Router();

// router.post('/apply', protect, applyAsAffiliate);
// router.post('/generate-link', protect, generateLink);
// router.get('/track', trackCustomReferralClick);
// router.get('/track/:productId', trackReferralClick); // for product links
// router.get('/admin/all', isAdmin, getAllAffiliates);
// router.put('/admin/update/:id', isAdmin, updateAffiliateStatus);
// router.get('/popular', isAdmin, getPopularProducts);
// router.get('/activity', isAdmin, getProductActivity);


// export default router;




import express from 'express';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/affiliateController.js';
import rateLimit from 'express-rate-limit';


const router = express.Router();


const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });


router.post('/apply', protect, ctrl.applyAsAffiliate);
router.put('/admin/update/:id', isAdmin, ctrl.updateAffiliateStatus);
router.post('/generate-link', protect, ctrl.generateLink);
router.get('/r/:shortCode', publicLimiter, ctrl.redirectShortLink); // public redirect
router.get('/track/:productId', ctrl.trackProductClick);
router.get('/admin/all', isAdmin, ctrl.getAllAffiliates);
router.get('/admin/export', isAdmin, ctrl.exportAffiliatesCSV);


export default router; 