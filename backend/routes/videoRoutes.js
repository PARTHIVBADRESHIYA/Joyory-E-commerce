import express from 'express';
import { isAdmin, protect } from '../middlewares/authMiddleware.js';
import { createVideo, updateVideo, removeVideo, getTrendingVideos ,getAllVideos} from '../controllers/videos/videoController.js';
import { uploadVideoWithThumbnail } from '../middlewares/upload.js';

const router = express.Router();

router.get('/', getAllVideos);
router.post('/', isAdmin, uploadVideoWithThumbnail.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
]), createVideo);

router.put('/:id', isAdmin, uploadVideoWithThumbnail.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
]), updateVideo);

router.delete('/:id', isAdmin, removeVideo);

// Public
router.get('/trending', getTrendingVideos);      // trending videos

export default router;  