import express from 'express';
import {  isAdmin, protect } from '../middlewares/authMiddleware.js';
import { createVideo, updateVideo, removeVideo, getTrendingVideos } from '../controllers/videos/videoController.js';


const router = express.Router();

router.post('/',isAdmin, createVideo);
router.put('/:id',isAdmin, updateVideo);
router.delete('/:id',isAdmin, removeVideo);

// Public
router.get('/trending', getTrendingVideos);      // trending videos

export default router;