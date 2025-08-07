import express from 'express';
import { registerTeamMember, loginTeamMember, getAllTeamMembers } from '../../../controllers/settings/admin/teamController.js';
import { verifyAdminOrTeamMember } from '../../../middlewares/authMiddleware.js';
import { teamMemberLoginLimiter } from '../../../middlewares/security/rateLimiter.js';

import { teamMemberSchema } from '../../../middlewares/validations/teamMemberValidator.js';
import { validate } from '../../../middlewares/validations/validate.js'; // this is your middleware

const router = express.Router();

// Invite/register a team member (only by someone assigned to the role)
router.post('/register', verifyAdminOrTeamMember,  validate(teamMemberSchema),registerTeamMember);

// Login for sub-admin
router.post('/login', teamMemberLoginLimiter, loginTeamMember);

// List all team members added by this admin/sub-admin
router.get('/list', verifyAdminOrTeamMember, getAllTeamMembers);

export default router;
