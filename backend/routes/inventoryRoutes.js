import express from 'express';
import { addInventoryItem, getInventoryItems, getInventorySummary} from "./../controllers/inventoryController.js";
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/add', verifyAdminOrTeamMember, addInventoryItem);
router.get('/', verifyAdminOrTeamMember, getInventoryItems);
router.get('/summary', verifyAdminOrTeamMember, getInventorySummary);


export default router;
