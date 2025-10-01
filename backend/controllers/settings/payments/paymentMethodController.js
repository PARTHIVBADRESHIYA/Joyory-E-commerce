
// import PaymentMethod from "../../../models/settings/payments/PaymentMethod.js";

// // ➕ Create a new payment method
// export const createPaymentMethod = async (req, res) => {
//     try {
//         const { name, key, type, description, config, isActive, order } = req.body;

//         const existing = await PaymentMethod.findOne({ key });
//         if (existing) {
//             return res.status(400).json({ success: false, message: "Payment method with this key already exists" });
//         }

//         const method = await PaymentMethod.create({
//             name,
//             key,
//             type,
//             description,
//             config,
//             isActive,
//             order,
//             createdBy: req.admin?._id, // only if you attach admin from auth middleware
//         });

//         res.status(201).json({ success: true, method });
//     } catch (err) {
//         console.error("createPaymentMethod error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // 📖 Get all payment methods (admin)
// export const getAllPaymentMethods = async (req, res) => {
//     try {
//         const methods = await PaymentMethod.find().sort({ order: 1, name: 1 });
//         res.json({ success: true, methods });
//     } catch (err) {
//         console.error("getAllPaymentMethods error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ✏️ Update a payment method
// export const updatePaymentMethod = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const updates = req.body;

//         const method = await PaymentMethod.findByIdAndUpdate(id, updates, { new: true });
//         if (!method) return res.status(404).json({ success: false, message: "Payment method not found" });

//         res.json({ success: true, method });
//     } catch (err) {
//         console.error("updatePaymentMethod error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // 🔀 Toggle active/inactive
// export const togglePaymentMethod = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const method = await PaymentMethod.findById(id);
//         if (!method) return res.status(404).json({ success: false, message: "Payment method not found" });

//         method.isActive = !method.isActive;
//         await method.save();

//         res.json({ success: true, method });
//     } catch (err) {
//         console.error("togglePaymentMethod error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ❌ Delete
// export const deletePaymentMethod = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const method = await PaymentMethod.findByIdAndDelete(id);
//         if (!method) return res.status(404).json({ success: false, message: "Payment method not found" });

//         res.json({ success: true, message: "Payment method deleted" });
//     } catch (err) {
//         console.error("deletePaymentMethod error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };




import PaymentMethod from "../../../models/settings/payments/PaymentMethod.js";

// ➕ Create a new payment method
export const createPaymentMethod = async (req, res) => {
    try {
        const { name, key, type, description, config, isActive, order } = req.body;

        if (!name || !key || !type) {
            return res.status(400).json({ success: false, message: "Name, key and type are required" });
        }

        const existing = await PaymentMethod.findOne({ key });
        if (existing) {
            return res.status(400).json({ success: false, message: "Payment method with this key already exists" });
        }

        const method = await PaymentMethod.create({
            name,
            key,
            type,
            description,
            config,
            isActive,
            order,
            createdBy: req.admin?._id,
        });

        res.status(201).json({ success: true, method });
    } catch (err) {
        console.error("createPaymentMethod error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 📖 Get all payment methods (admin only)
export const getAllPaymentMethods = async (req, res) => {
    try {
        const methods = await PaymentMethod.find().sort({ order: 1, name: 1 });
        res.json({ success: true, methods });
    } catch (err) {
        console.error("getAllPaymentMethods error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ✏️ Update a payment method
export const updatePaymentMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const method = await PaymentMethod.findByIdAndUpdate(id, updates, { new: true });
        if (!method) return res.status(404).json({ success: false, message: "Payment method not found" });

        res.json({ success: true, method });
    } catch (err) {
        console.error("updatePaymentMethod error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔀 Toggle active/inactive
export const togglePaymentMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const method = await PaymentMethod.findById(id);
        if (!method) return res.status(404).json({ success: false, message: "Payment method not found" });

        method.isActive = !method.isActive;
        await method.save();

        res.json({ success: true, method });
    } catch (err) {
        console.error("togglePaymentMethod error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ❌ Delete
export const deletePaymentMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const method = await PaymentMethod.findByIdAndDelete(id);
        if (!method) return res.status(404).json({ success: false, message: "Payment method not found" });

        res.json({ success: true, message: "Payment method deleted" });
    } catch (err) {
        console.error("deletePaymentMethod error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
