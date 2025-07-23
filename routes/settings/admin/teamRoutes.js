import express from 'express';
import { registerTeamMember, loginTeamMember, getAllTeamMembers } from '../../../controllers/settings/admin/teamController.js';
import { verifyAdminOrTeamMember } from '../../../middlewares/authMiddleware.js';

const router = express.Router();

// Invite/register a team member (only by someone assigned to the role)
router.post('/register', verifyAdminOrTeamMember, registerTeamMember);

// Login for sub-admin
router.post('/login', loginTeamMember);

// List all team members added by this admin/sub-admin
router.get('/list', verifyAdminOrTeamMember, getAllTeamMembers);

export default router;
