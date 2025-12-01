import express from 'express';
import multer from 'multer';
import {
  registerRoleAdmin,
  loginRoleAdmin,
  getRoleAdminProfile,
  getAccountGeneralSettings,
  updateAccountGeneralSettings,
  uploadProfilePic,
  deleteRoleAdminAccount
} from '../../../controllers/settings/admin/adminRoleAdminController.js';

import { verifyRoleAdmin } from "../../../middlewares/authMiddleware.js";
import { adminRoleAdminLoginLimiter } from "../../../middlewares/security/rateLimiter.js";
const upload = multer({ dest: 'uploads/profilePics/' });

const router = express.Router();

// 🔐 Auth
router.post('/register',registerRoleAdmin);
router.post('/login', adminRoleAdminLoginLimiter, loginRoleAdmin);
router.get('/profile', verifyRoleAdmin, getRoleAdminProfile);

// ⚙️ Account General Settings
router.get('/account/general', verifyRoleAdmin, getAccountGeneralSettings);
router.put('/account/general', verifyRoleAdmin,updateAccountGeneralSettings);
router.post('/account/profile-pic', verifyRoleAdmin, upload.single('profilePic'), uploadProfilePic);
router.delete('/account/delete', verifyRoleAdmin, deleteRoleAdminAccount);

export default router;
