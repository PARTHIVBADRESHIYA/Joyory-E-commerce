import express from 'express';
import { createAdminRole, getAllAdminRoles, updateAdminRole, deleteAdminRole } from '../../../controllers/settings/admin/adminRoleController.js';
import { verifyAdminOrTeamMember, checkPermission } from '../../../middlewares/authMiddleware.js';
import { validate } from '../../../middlewares/validations/validate.js';
import { adminRoleSchema, adminRoleUpdateSchema } from '../../../middlewares/validations/adminRoleValidator.js'; // make sure path is correct
const router = express.Router();

// Only Super Admins (main admin) should be allowed to manage roles
router.post('/create', verifyAdminOrTeamMember, validate(adminRoleSchema), createAdminRole);
router.get('/list', verifyAdminOrTeamMember, getAllAdminRoles);
router.put('/update/:roleId', verifyAdminOrTeamMember, validate(adminRoleUpdateSchema), updateAdminRole);
router.delete('/delete/:roleId', verifyAdminOrTeamMember, deleteAdminRole);

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
