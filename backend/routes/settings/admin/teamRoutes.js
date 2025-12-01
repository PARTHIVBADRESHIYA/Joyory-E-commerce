import express from 'express';
import { registerTeamMember, loginTeamMember, getAllTeamMembers,getTeamMemberById,updateTeamMember,deleteTeamMember } from '../../../controllers/settings/admin/teamController.js';
import { verifyAdminOrTeamMember } from '../../../middlewares/authMiddleware.js';
import { teamMemberLoginLimiter } from '../../../middlewares/security/rateLimiter.js';



const router = express.Router();

// Invite/register a team member (only by someone assigned to the role)
router.post('/register', verifyAdminOrTeamMember,registerTeamMember);

// Login for sub-admin
router.post('/login', teamMemberLoginLimiter, loginTeamMember);

// List all team members added by this admin/sub-admin
router.get('/list', verifyAdminOrTeamMember, getAllTeamMembers);

// Get a specific team member by ID
router.get('/:id', verifyAdminOrTeamMember, getTeamMemberById);

// Update a specific team member by ID
router.put('/:id', verifyAdminOrTeamMember, updateTeamMember);

// Delete a specific team member by ID
router.delete('/:id', verifyAdminOrTeamMember, deleteTeamMember);

export default router;
