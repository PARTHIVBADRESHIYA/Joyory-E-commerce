import express from 'express';
import { getInventoryItems, getInventorySummary } from "./../controllers/inventoryController.js";
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', verifyAdminOrTeamMember, getInventoryItems);
router.get('/summary', verifyAdminOrTeamMember, getInventorySummary);


export default router;
