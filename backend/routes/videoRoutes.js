import express from 'express';
import { isAdmin, protect } from '../middlewares/authMiddleware.js';
import { createVideo, updateVideo, removeVideo, getTrendingVideos, getAllVideos } from '../controllers/videos/videoController.js';
import { uploadVideoWithThumbnail } from '../middlewares/upload.js';

const router = express.Router();

router.get('/', getAllVideos);
router.post('/', isAdmin, uploadVideoWithThumbnail, createVideo);


router.put('/:id', isAdmin, uploadVideoWithThumbnail, updateVideo);


router.delete('/:id', isAdmin, removeVideo);

// Public
router.get('/trending', getTrendingVideos);      // trending videos

export default router;  