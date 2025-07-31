import express from 'express';
import { protect } from '../../middlewares/authMiddleware.js';
import { addOrUpdateAddress, getUserAddress } from '../../controllers/user/userAddressController.js';

const router = express.Router();

// 🏠 Address Routes
router.post('/', protect, addOrUpdateAddress);
router.get('/', protect, getUserAddress);

export default router;
