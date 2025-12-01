import express from 'express';
import { createAdminRole, getAllAdminRoles, updateAdminRole, deleteAdminRole } from '../../../controllers/settings/admin/adminRoleController.js';
import { verifyAdminOrTeamMember, checkPermission } from '../../../middlewares/authMiddleware.js';
const router = express.Router();

// Only Super Admins (main admin) should be allowed to manage roles
router.post('/create', verifyAdminOrTeamMember, createAdminRole);
router.get('/list', verifyAdminOrTeamMember, getAllAdminRoles);
router.put('/update/:id', verifyAdminOrTeamMember, updateAdminRole);
router.delete('/delete/:id', verifyAdminOrTeamMember, deleteAdminRole);

router.get(
    '/test-products-view',
    verifyAdminOrTeamMember,         // authenticate
    checkPermission('products:view'), // check permission
    (req, res) => {
        res.status(200).json({ message: 'You have access to view products!' });
    }
);

// Another example for orders:refund
router.get(
    '/test-orders-refund',
    verifyAdminOrTeamMember,
    checkPermission('orders:refund'),
    (req, res) => {
        res.status(200).json({ message: 'You can refund orders!' });
    }
);

export default router;
