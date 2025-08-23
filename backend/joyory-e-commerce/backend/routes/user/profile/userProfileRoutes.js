// routes/userRoutes.js
import { getUserProfile, updateUserProfile, uploadProfileImage, getProfileImage, removeProfileImage, addUserAddress,getUserAddresses, updateUserAddress, deleteUserAddress, sendVerificationOtp, verifyOtp } from '../../../controllers/user/profile/userProfileController.js';

import express from 'express';
import { protect } from '../../../middlewares/authMiddleware.js';
import { uploaduserProfile } from '../../../middlewares/upload.js';

import { addressSchema } from '../../../middlewares/validations/userValidation.js';
import { validate } from '../../../middlewares/validations/validate.js';

const router = express.Router();

// user profile
router.get('/', protect, getUserProfile);
router.patch('/', protect, updateUserProfile);

router.get('/avatar',  protect, getProfileImage);
router.post('/avatar', protect, uploaduserProfile.single('image'), uploadProfileImage); 
router.delete('/avatar', protect, removeProfileImage);

// address routes
router.get('/address', protect, getUserAddresses);
router.post('/address',validate(addressSchema), protect, addUserAddress);
router.patch('/address/:id', protect, updateUserAddress);
router.delete('/address/:id', protect, deleteUserAddress);

// verification
router.post('/send-otp', protect, sendVerificationOtp);
router.post('/verify-otp', protect, verifyOtp);

export default router;