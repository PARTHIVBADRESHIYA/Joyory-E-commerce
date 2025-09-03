// import GiftCard from "../models/GiftCardTemplate.js";
// import { generateGiftCardCode, generatePin } from "../middlewares/utils/generateGiftCard.js";

// // Admin: Create a gift card manually
// export const createGiftCardAdmin = async (req, res) => {
//     try {
//         const { amount, recipient, sender, message, design, expiryDate } = req.body;

//         const image = req.file ? req.file.path : null;

//         const giftCard = new GiftCard({
//             code: generateGiftCardCode(),
//             pin: generatePin(),
//             amount,
//             balance: amount,
//             expiryDate,
//             recipient,
//             sender,
//             message,
//             image,
//             design
//         });

//         await giftCard.save();
//         res.status(201).json({ message: "Gift card created", giftCard });
//     } catch (err) {
//         res.status(500).json({ message: "Failed to create gift card", error: err.message });
//     }
// };

// // Get all gift cards
// export const getAllGiftCards = async (req, res) => {
//     try {
//         const giftCards = await GiftCard.find().sort({ createdAt: -1 });
//         res.json(giftCards);
//     } catch (err) {
//         res.status(500).json({ message: "Failed to fetch gift cards", error: err.message });
//     }
// };

// // Update gift card
// export const updateGiftCard = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const updateData = { ...req.body };

//         if (req.file) {
//             updateData.image = req.file.path;
//         }

//         const giftCard = await GiftCard.findByIdAndUpdate(id, updateData, { new: true });
//         if (!giftCard) return res.status(404).json({ message: "Gift card not found" });

//         res.json({ message: "Gift card updated", giftCard });
//     } catch (err) {
//         res.status(500).json({ message: "Failed to update gift card", error: err.message });
//     }
// };

// // Delete gift card
// export const deleteGiftCard = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const giftCard = await GiftCard.findByIdAndDelete(id);
//         if (!giftCard) return res.status(404).json({ message: "Gift card not found" });

//         res.json({ message: "Gift card deleted" });
//     } catch (err) {
//         res.status(500).json({ message: "Failed to delete gift card", error: err.message });
//     }
// };












import GiftCardTemplate from "../models/GiftCardTemplate.js";

// ✅ Create template
export const createGiftCardTemplate = async (req, res) => {
    try {
        const { title, description, minAmount, maxAmount } = req.body;
        const image = req.file ? req.file.path : null;

        if (!title || !description || !image) {
            return res.status(400).json({ message: "Title, description, and image are required" });
        }

        const template = new GiftCardTemplate({
            title,
            description,
            image,
            minAmount,
            maxAmount
        });

        await template.save();
        res.status(201).json({ message: "Gift card template created", template });
    } catch (err) {
        res.status(500).json({ message: "Failed to create template", error: err.message });
    }
};

// ✅ Get all templates
export const getAllGiftCardTemplates = async (req, res) => {
    try {
        const templates = await GiftCardTemplate.find().sort({ createdAt: -1 });
        res.json(templates);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch templates", error: err.message });
    }
};

// ✅ Update template
export const updateGiftCardTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        if (req.file) {
            updateData.image = req.file.path;
        }

        const template = await GiftCardTemplate.findByIdAndUpdate(id, updateData, { new: true });
        if (!template) return res.status(404).json({ message: "Template not found" });

        res.json({ message: "Template updated", template });
    } catch (err) {
        res.status(500).json({ message: "Failed to update template", error: err.message });
    }
};

// ✅ Delete template
export const deleteGiftCardTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await GiftCardTemplate.findByIdAndDelete(id);
        if (!template) return res.status(404).json({ message: "Template not found" });

        res.json({ message: "Template deleted" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete template", error: err.message });
    }
};
