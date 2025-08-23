import Discount from '../models/Discount.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';

// Create Discount
export const createDiscount = async (req, res) => {
    try {
        const {
            name, code, status, type, value,
            eligibility, startDate, endDate,
            totalLimit, perCustomerLimit,
            appliesTo, productIds, collectionIds, minimumOrderAmount
        } = req.body;

        const discountCode = code || `DIS_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const discount = new Discount({
            name,
            code: discountCode,
            status,
            type,
            value,
            eligibility,
            startDate,
            endDate,
            totalLimit,
            perCustomerLimit,
            appliesTo,
            productIds,
            collectionIds,
            minimumOrderAmount,
            createdBy: req.user?._id || "68788e15ff4da0de0a252abb"
        });

        await discount.save();
        res.status(201).json({ message: 'Discount created', discount });
    } catch (err) {
        res.status(500).json({ message: 'Error creating discount', error: err.message });
    }
};

// Fetch all discounts (summary-style)
export const getAllDiscounts = async (req, res) => {
    try {
        const discounts = await Discount.find();

        const summary = discounts.map(d => {
            const expiry = d.endDate
                ? new Date(d.endDate).toLocaleDateString('en-GB') // Format: DD/MM/YYYY
                : 'No Expiry';

            return {
                code: d.code,
                type: d.type,
                discount: d.type === 'Percentage' ? `${d.value}%` : `₹${d.value}`,
                usage: `${d.usageCount || 0}/${d.totalLimit || '∞'}`,
                expiry,
                status: d.status
            };
        });

        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching discounts', error: err.message });
    }
};


// Update discount
export const updateDiscount = async (req, res) => {
    try {
        const discount = await Discount.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!discount) return res.status(404).json({ message: 'Discount not found' });
        res.json({ message: 'Discount updated', discount });
    } catch (err) {
        res.status(500).json({ message: 'Error updating discount', error: err.message });
    }
};

// Delete discount
export const deleteDiscount = async (req, res) => {
    try {
        const discount = await Discount.findByIdAndDelete(req.params.id);
        if (!discount) return res.status(404).json({ message: 'Discount not found' });
        res.json({ message: 'Discount deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting discount', error: err.message });
    }
};

export const getDiscountDashboardAnalytics = async (req, res) => {
    try {
        const allDiscounts = await Discount.find();

        const activeDiscounts = allDiscounts.filter(d => {
            const now = new Date();
            return (
                (!d.startDate || d.startDate <= now) &&
                (!d.endDate || d.endDate >= now) &&
                (!d.totalLimit || d.usageCount < d.totalLimit)
            );
        });

        const totalUses = allDiscounts.reduce((sum, d) => sum + (d.usageCount || 0), 0);

        const revenueImpact = await Order.aggregate([
            { $match: { discountCode: { $exists: true, $ne: null } } },
            { $group: { _id: null, total: { $sum: '$discountAmount' } } }
        ]);

        // ✅ Calculate average discount percentage from all discounted orders
        const avgDiscountPercentage = await Order.aggregate([
            {
                $match: {
                    discountCode: { $exists: true, $ne: null },
                    discountAmount: { $gt: 0 },
                    amount: { $gt: 0 }
                }
            },
            {
                $project: {
                    discountPercent: {
                        $multiply: [
                            { $divide: ['$discountAmount', '$amount'] },
                            100
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avg: { $avg: '$discountPercent' }
                }
            }
        ]);

        // Optional: avg discount flat value
        const avgDiscountAmount = await Order.aggregate([
            { $match: { discountAmount: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$discountAmount' } } }
        ]);

        res.status(200).json({
            activeDiscounts: activeDiscounts.length,
            totalUses,
            revenueImpact: revenueImpact[0]?.total || 0,
            avgDiscount: Math.round(avgDiscountPercentage[0]?.avg || 0), // 🔥 unified percentage
            avgDiscountAmount: Math.round(avgDiscountAmount[0]?.avg || 0) // raw value (₹)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};



