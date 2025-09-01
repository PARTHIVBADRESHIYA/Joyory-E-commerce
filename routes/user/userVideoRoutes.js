import express from 'express';
import { getBySlug, listPublic, recordView } from '../../controllers/user/userVideoController.js';
import { protect } from '../../middlewares/authMiddleware.js';

const router = express.Router();


router.get('/', listPublic);
router.get('/:slug', getBySlug);
router.post('/:id/view', protect,recordView); // call this when the

export default router;  