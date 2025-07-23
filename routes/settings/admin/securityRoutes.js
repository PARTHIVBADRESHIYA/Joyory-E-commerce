import express from 'express';
import {
    changePassword,
    setupMFA,
    verifyMFA,
    getLoginHistory
} from '../../../controllers/settings/admin/securityController.js';
import { verifyAdminOrTeamMember } from '../../../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/change-password', verifyAdminOrTeamMember, changePassword);
router.get('/setup-mfa', verifyAdminOrTeamMember, setupMFA);
router.post('/verify-mfa', verifyAdminOrTeamMember, verifyMFA);
router.get('/login-history', verifyAdminOrTeamMember, getLoginHistory);

export default router;
