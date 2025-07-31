import express from 'express';
import { updateNotification, testNotification } from '../../../controllers/settings/admin/notificationController.js';
import { verifyAdminOrTeamMember } from '../../../middlewares/authMiddleware.js';

const router = express.Router();


router.put('/update', verifyAdminOrTeamMember, updateNotification);
router.post('/test', verifyAdminOrTeamMember, testNotification);

export default router;
