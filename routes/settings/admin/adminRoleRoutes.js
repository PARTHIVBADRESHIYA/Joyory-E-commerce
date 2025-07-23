import express from 'express';
import { createAdminRole, getAllAdminRoles, updateAdminRole, deleteAdminRole } from '../../../controllers/settings/admin/adminRoleController.js';
import { verifyAdminOrTeamMember } from '../../../middlewares/authMiddleware.js';

const router = express.Router();

// Only Super Admins (main admin) should be allowed to manage roles
router.post('/create', verifyAdminOrTeamMember, createAdminRole);
router.get('/list', verifyAdminOrTeamMember, getAllAdminRoles);
router.put('/update/:roleId', verifyAdminOrTeamMember, updateAdminRole);
router.delete('/delete/:roleId', verifyAdminOrTeamMember, deleteAdminRole);

export default router;
    