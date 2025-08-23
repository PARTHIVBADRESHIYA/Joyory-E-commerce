import PaymentMethod from '../../../models/settings/payments/PaymentMethod.js';
import Payment from '../../../models/settings/payments/Payment.js';
import mongoose from 'mongoose';
export const createPaymentMethod = async (req, res) => {
    try {
        const data = Array.isArray(req.body) ? req.body : [req.body];

        const invalid = data.filter(item => !item.name || !item.type);
        if (invalid.length) {
            return res.status(400).json({ message: 'Each payment method must have a name and type' });
        }

        // Prevent duplicates (check by name)
        const existingNames = await PaymentMethod.find({ name: { $in: data.map(d => d.name) } });
        const existingSet = new Set(existingNames.map(e => e.name));

        const filtered = data.filter(d => !existingSet.has(d.name));

        if (filtered.length === 0) {
            return res.status(400).json({ message: 'All provided methods already exist' });
        }

        const newMethods = await PaymentMethod.insertMany(filtered);
        res.status(201).json({ message: 'Payment methods added', methods: newMethods });

    } catch (err) {
        res.status(500).json({ message: 'Failed to add payment methods', error: err.message });
    }
};


export const toggleMethodStatus = async (req, res) => {
    try {
        const method = await PaymentMethod.findById(req.params.id);
        if (!method) return res.status(404).json({ message: 'Method not found' });
        method.isActive = !method.isActive;
        await method.save();
        res.status(200).json({ message: 'Status toggled', isActive: method.isActive });
    } catch (err) {
        res.status(500).json({ message: 'Error toggling status', error: err.message });
    }
};

export const getAllPaymentMethods = async (req, res) => {
    try {
        const methods = await PaymentMethod.find().sort({ createdAt: -1 });
        res.status(200).json(methods);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching methods', error: err.message });
    }
};

// 👤 For single method card (like "Credit Card" with toggle, stats)
export const getMethodDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid method ID" });
        }

        const [method, stats] = await Promise.all([
            PaymentMethod.findById(id),
            Payment.aggregate([
                { $match: { method: new mongoose.Types.ObjectId(id) } },
                {
                    $group: {
                        _id: "$method",
                        transactions: { $sum: 1 },
                        revenue: { $sum: "$amount" }
                    }
                }
            ])
        ]);

        if (!method) return res.status(404).json({ message: "Method not found" });

        res.status(200).json({
            method: method.name,
            type: method.type,
            isActive: method.isActive,
            transactions: stats[0]?.transactions || 0,
            revenue: stats[0]?.revenue || 0
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch method details", error: err.message });
    }
};