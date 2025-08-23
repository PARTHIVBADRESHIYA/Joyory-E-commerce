import express from 'express';
import {
    createTicket,
    getAllTickets,
    getSupportSummary,
    updateTicketStatus
} from '../controllers/supportController.js';

const router = express.Router();

router.post('/create', createTicket);
router.get('/all', getAllTickets);
router.get('/summary', getSupportSummary);
router.patch('/status/:id', updateTicketStatus);

export default router;

