    // routes/userRoutes.js
    import express from 'express';
    import {
        getAllUsers,
        getUserById,
        updateUserByAdmin,
        deleteUser,
        getUserAnalytics,
        getFullCustomerAnalytics
    } from '../controllers/userController.js';
    import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

    const router = express.Router();

    router.get('/', verifyAdminOrTeamMember, getAllUsers);
    router.get('/customer-analytics', verifyAdminOrTeamMember, getFullCustomerAnalytics);
    router.get('/:id', verifyAdminOrTeamMember, getUserById);
    router.put('/:id', verifyAdminOrTeamMember, updateUserByAdmin);
    router.delete('/:id', verifyAdminOrTeamMember, deleteUser);
    router.get('/analytics/:id', verifyAdminOrTeamMember, getUserAnalytics);

    export default router; 