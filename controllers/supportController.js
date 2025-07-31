import SupportTicket from '../models/SupportTicket.js';

// Create Ticket
export const createTicket = async (req, res) => {
    try {
        const { customer, subject, message, type, assignedTo } = req.body;
        const ticketId = '#TK-' + Math.floor(1000 + Math.random() * 9000);

        const newTicket = await SupportTicket.create({
            ticketId,
            customer,
            subject,
            message,
            type,
            assignedTo
        });

        res.status(201).json({ message: 'Ticket created', ticket: newTicket });
    } catch (err) {
        res.status(500).json({ message: 'Failed to create ticket', error: err.message });
    }
};

// Get All Tickets with filters
export const getAllTickets = async (req, res) => {
    try {
        const { status, type } = req.query;
        const query = {};
        if (status) query.status = status;
        if (type) query.type = type;

        const tickets = await SupportTicket.find(query).sort({ createdAt: -1 });

        res.status(200).json(tickets);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch tickets', error: err.message });
    }
};

// Dashboard Summary
export const getSupportSummary = async (req, res) => {
    try {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const openTickets = await SupportTicket.countDocuments({ status: 'Open' });
        const resolvedTickets = await SupportTicket.countDocuments({ status: 'Resolved' });
        const last24hTickets = await SupportTicket.countDocuments({ createdAt: { $gte: last24h } });

        const resolvedLastWeek = await SupportTicket.find({ status: 'Resolved', resolvedAt: { $gte: lastWeek } });
        const avgResponseTime = resolvedLastWeek.length > 0
            ? (resolvedLastWeek.reduce((sum, t) => sum + (t.resolvedAt - t.createdAt), 0) / resolvedLastWeek.length) / (1000 * 60 * 60)
            : 0;

        res.status(200).json({
            openTickets,
            resolvedTickets,
            avgResponseTime: avgResponseTime.toFixed(1),
            last24hTickets
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to get summary', error: err.message });
    }
};

// Update Ticket Status
export const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const update = { status };
        if (status === 'Resolved') update.resolvedAt = new Date();

        const ticket = await SupportTicket.findByIdAndUpdate(id, update, { new: true });
        res.status(200).json({ message: 'Status updated', ticket });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update ticket', error: err.message });
    }
};
