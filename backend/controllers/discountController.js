import Discount from '../models/Discount.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';

// Create Discount
export const createDiscount = async (req, res) => {
    try {
        const {
            name, code, description,status, type, value,
            eligibility, startDate, endDate,
            totalLimit, perCustomerLimit,
            appliesTo, productIds, collectionIds, minimumOrderAmount
        } = req.body;

        const discountCode = code || `DIS_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const discount = new Discount({
            name,
            code: discountCode,
            description,
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
        res.status(201).json({
            message: 'Discount created', discount: {
                _id: discount._id,
                ...discount.toObject()
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Error creating discount', error: err.message });
    }
};

// Update discount
export const updateDiscount = async (req, res) => {
    try {
        const discount = await Discount.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!discount) return res.status(404).json({ message: 'Discount not found' });
        res.json({
            message: 'Discount updated',
            discount: {
                _id: discount._id,
                ...discount.toObject()
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Error updating discount', error: err.message });
    }
};

// Delete discount
export const deleteDiscount = async (req, res) => {
    try {
        const discount = await Discount.findByIdAndDelete(req.params.id);
        if (!discount) return res.status(404).json({ message: 'Discount not found' });
        res.json({
            message: 'Discount deleted',
            _id: discount._id
        });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting discount', error: err.message });
    }
};

export const getAllDiscounts = async (req, res) => {
    try {
        const {
            code,
            type,
            status,
            minValue,
            maxValue,
            minUsage,
            maxUsage,
            activeOnly,
            expiredOnly,
            startDateFrom,
            startDateTo,
            endDateFrom,
            endDateTo
        } = req.query;

        const filter = {};

        // 🔍 Search by exact code
        if (code) {
            filter.code = { $regex: code, $options: "i" }; // case-insensitive
        }

        // 🔍 Filter by type (Percentage / Flat)
        if (type) {
            filter.type = type;
        }

        // 🔍 Status (Active / Inactive)
        if (status) {
            filter.status = status;
        }

        // 🔍 Value range
        if (minValue || maxValue) {
            filter.value = {};
            if (minValue) filter.value.$gte = Number(minValue);
            if (maxValue) filter.value.$lte = Number(maxValue);
        }

        // 🔍 Usage range
        if (minUsage || maxUsage) {
            filter.usageCount = {};
            if (minUsage) filter.usageCount.$gte = Number(minUsage);
            if (maxUsage) filter.usageCount.$lte = Number(maxUsage);
        }

        // 🔍 Active only (valid date & limit not reached)
        if (activeOnly === "true") {
            const now = new Date();
            filter.$and = [
                { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }] },
                { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }] },
                { $or: [{ totalLimit: { $exists: false } }, { $expr: { $lt: ["$usageCount", "$totalLimit"] } }] }
            ];
        }

        // 🔍 Expired only
        if (expiredOnly === "true") {
            const now = new Date();
            filter.endDate = { $lt: now };
        }

        // 🔍 Start date range
        if (startDateFrom || startDateTo) {
            filter.startDate = {};
            if (startDateFrom) filter.startDate.$gte = new Date(startDateFrom);
            if (startDateTo) filter.startDate.$lte = new Date(startDateTo);
        }

        // 🔍 End date range
        if (endDateFrom || endDateTo) {
            filter.endDate = {};
            if (endDateFrom) filter.endDate.$gte = new Date(endDateFrom);
            if (endDateTo) filter.endDate.$lte = new Date(endDateTo);
        }

        const discounts = await Discount.find(filter);

        const summary = discounts.map(d => {
            const expiry = d.endDate
                ? new Date(d.endDate).toLocaleDateString('en-GB')
                : "No Expiry";

            return {
                _id: d._id, // 👈 added
                code: d.code,
                type: d.type,
                discount: d.type === "Percentage" ? `${d.value}%` : `₹${d.value}`,
                usage: `${d.usageCount || 0}/${d.totalLimit || "∞"}`,
                expiry,
                status: d.status
            };
        });

        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: "Error fetching discounts", error: err.message });
    }
};

export const getDiscountDashboardAnalytics = async (req, res) => {
    try {
        const { type, status, code } = req.query;

        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        if (code) filter.code = { $regex: code, $options: "i" };

        const allDiscounts = await Discount.find(filter);

        const activeDiscounts = allDiscounts.filter(d => {
            const now = new Date();
            return (
                (!d.startDate || d.startDate <= now) &&
                (!d.endDate || d.endDate >= now) &&
                (!d.totalLimit || d.usageCount < d.totalLimit)
            );
        });

        const totalUses = allDiscounts.reduce((sum, d) => sum + (d.usageCount || 0), 0);

        // Restrict Order analytics only for matched discount codes
        const discountCodes = allDiscounts.map(d => d.code);
        const matchOrders = discountCodes.length ? { discountCode: { $in: discountCodes } } : { discountCode: { $exists: true, $ne: null } };

        const revenueImpact = await Order.aggregate([
            { $match: matchOrders },
            { $group: { _id: null, total: { $sum: "$discountAmount" } } }
        ]);

        const avgDiscountPercentage = await Order.aggregate([
            { $match: { ...matchOrders, discountAmount: { $gt: 0 }, amount: { $gt: 0 } } },
            {
                $project: {
                    discountPercent: {
                        $multiply: [{ $divide: ["$discountAmount", "$amount"] }, 100]
                    }
                }
            },
            { $group: { _id: null, avg: { $avg: "$discountPercent" } } }
        ]);

        const avgDiscountAmount = await Order.aggregate([
            { $match: { ...matchOrders, discountAmount: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: "$discountAmount" } } }
        ]);

        res.status(200).json({
            activeDiscounts: activeDiscounts.length,
            totalUses,
            revenueImpact: revenueImpact[0]?.total || 0,
            avgDiscount: Math.round(avgDiscountPercentage[0]?.avg || 0),
            avgDiscountAmount: Math.round(avgDiscountAmount[0]?.avg || 0)
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get discount by ID (full details)
export const getDiscountById = async (req, res) => {
    try {
        const { id } = req.params;

        const discount = await Discount.findById(id);
        if (!discount) {
            return res.status(404).json({ message: "Discount not found" });
        }

        // build response with clean structure
        res.status(200).json({
            _id: discount._id,
            name: discount.name,
            code: discount.code,
            status: discount.status,
            type: discount.type,
            value: discount.value,
            eligibility: discount.eligibility,
            startDate: discount.startDate,
            endDate: discount.endDate,
            totalLimit: discount.totalLimit,
            perCustomerLimit: discount.perCustomerLimit,
            usageCount: discount.usageCount || 0,
            appliesTo: discount.appliesTo,
            productIds: discount.productIds,
            collectionIds: discount.collectionIds,
            minimumOrderAmount: discount.minimumOrderAmount,
            createdBy: discount.createdBy,
            createdAt: discount.createdAt,
            updatedAt: discount.updatedAt
        });
    } catch (err) {
        res.status(500).json({
            message: "Error fetching discount details",
            error: err.message
        });
    }
};
