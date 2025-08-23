import express from 'express';
import multer from 'multer';
import { getStoreSettings, updateStoreSettings } from '../../controllers/settings/storeSettingController.js';
import { verifyAdminOrTeamMember } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// Image upload (for logo)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/logos'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.get('/', verifyAdminOrTeamMember, getStoreSettings);
router.post('/', verifyAdminOrTeamMember, upload.single('logo'), updateStoreSettings);

export default router;
