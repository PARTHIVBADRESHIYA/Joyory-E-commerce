import User from '../models/User.js';
import Order from '../models/Order.js';

// @desc    Get all users (for admin)
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch users', error: err.message });
    }
};

// @desc    Get user by ID (for admin)
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving user', error: err.message });
    }
};

// @desc    Update user by admin
const updateUserByAdmin = async (req, res) => {
    try {
        const updates = req.body;
        const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!updatedUser) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({ message: 'User updated', user: updatedUser });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update user', error: err.message });
    }
};

// @desc    Delete user by admin
const deleteUser = async (req, res) => {
    try {
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete user', error: err.message });
    }
};

// @desc    Get user analytics (orders, income, etc)
const getUserAnalytics = async (req, res) => {
    try {
        const userId = req.params.id;
        const orders = await Order.find({ user: userId });

        if (!orders.length) {
            return res.status(404).json({ message: "No orders found for this user" });
        }

        let totalSpent = 0;
        let totalItemsOrdered = 0;
        let totalDiscountUsed = 0;
        let refunds = 0;
        let cancelled = 0;
        let lastOrderDate = null;

        const statusBreakdown = {};
        const paymentTypeBreakdown = {};

        for (const order of orders) {
            totalSpent += order.amount || 0;
            totalDiscountUsed += order.discountAmount || 0;
            lastOrderDate = !lastOrderDate || new Date(order.date) > new Date(lastOrderDate)
                ? order.date
                : lastOrderDate;

            for (const item of order.products) {
                totalItemsOrdered += item.quantity;
            }

            if (order.refund?.isRefunded) refunds++;
            if (order.status === 'Cancelled') cancelled++;

            statusBreakdown[order.status] = (statusBreakdown[order.status] || 0) + 1;
            paymentTypeBreakdown[order.orderType] = (paymentTypeBreakdown[order.orderType] || 0) + 1;
        }

        const averageOrderValue = parseFloat((totalSpent / orders.length).toFixed(2));

        const stats = {
            totalOrders: orders.length,
            totalSpent,
            totalItemsOrdered,
            totalDiscountUsed,
            refunds,
            cancelled,
            lastOrderDate,
            averageOrderValue,
            statusBreakdown,
            paymentTypeBreakdown
        };

        res.status(200).json(stats);

    } catch (err) {
        console.error("🔥 Error fetching user analytics:", err);
        res.status(500).json({ message: 'Failed to fetch analytics', error: err.message });
    }
};

// controllers/analyticsController.js

const getFullCustomerAnalytics = async (req, res) => {
    try {
        const [totalCustomers, incomeAgg, monthlySpend, refundOrders] = await Promise.all([
            // Total customers with role 'user'
            User.countDocuments({ role: 'user' }),

            // Total income from delivered or completed orders
            Order.aggregate([
                { $match: { status: { $in: ['Delivered', 'Completed'] } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),

            // Monthly spend from delivered or completed orders
            Order.aggregate([
                { $match: { status: { $in: ['Delivered', 'Completed'] } } },
                {
                    $group: {
                        _id: {
                            month: { $month: "$createdAt" },
                            year: { $year: "$createdAt" }
                        },
                        totalSpend: { $sum: "$amount" }
                    }
                }
            ]),

            // All orders where refund.isRefunded is true
            Order.find({ "refund.isRefunded": true }, { refund: 1 })
        ]);

        // Calculate refundCount and totalRefundAmount from refundOrders
        const refundCount = refundOrders.length;
        const totalRefundAmount = refundOrders.reduce((sum, order) => {
            return sum + (order.refund?.refundAmount || 0);
        }, 0);

        res.json({
            totalCustomers,
            totalIncome: incomeAgg[0]?.total || 0,
            monthlySpend,
            refundCount,
            totalRefundAmount
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};




export {
    getAllUsers,
    getUserById,
    updateUserByAdmin,
    deleteUser,
    getUserAnalytics,
    getFullCustomerAnalytics
};
