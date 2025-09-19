// controllers/refundController.js

import Order
    from "../models/Order";
export const markOrderRefunded = async (req, res) => {
    const { orderId } = req.params;
    const { amount, reason } = req.body;

    try {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        order.refund = {
            isRefunded: true,
            refundAmount: amount,
            refundReason: reason,
            refundedAt: new Date(),
        };

        await order.save();

        res.status(200).json({ message: 'Refund marked successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to mark refund', error: err.message });
    }
};
