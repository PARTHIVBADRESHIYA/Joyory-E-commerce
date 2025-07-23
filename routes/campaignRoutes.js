// routes/campaignRoutes.js
import express from 'express';
import upload from './../middlewares/upload.js';
import {
    createCampaign,
    getCampaignDashboard,
    getCampaignById,
    getAllCampaigns,
    getPerformanceByType,
    getEmailOpenTrends,
    sendCampaignNow,
    trackClick,
    trackOpen
} from '../controllers/campaignController.js';

const router = express.Router();

router.post('/', upload.single('image'), createCampaign);
router.post('/send/:id', sendCampaignNow); // ✅ added dynamic send route
router.get('/dashboard', getCampaignDashboard);
router.get('/charts/performance-by-type', getPerformanceByType);
router.get('/charts/open-trends', getEmailOpenTrends);
router.get('/', getAllCampaigns);
router.get('/:id', getCampaignById);
router.get('/open-track/:id', trackOpen);
router.get('/click-track/:id', trackClick);


export default router;
