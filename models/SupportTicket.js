import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true },
    customer: {
        name: String,
        email: String,
        avatar: String
    },
    subject: { type: String, required: true },
    message: { type: String },
    status: { type: String, enum: ['Open', 'Pending', 'Resolved'], default: 'Open' },
    type: { type: String, enum: ['Payment', 'Shipping', 'General', 'Technical'], default: 'General' },
    assignedTo: {
        name: String,
        avatar: String
    },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: Date
});

export default mongoose.model('SupportTicket', supportTicketSchema);
