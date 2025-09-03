// controllers/user/userGiftCardController.js
import GiftCard from "../../models/GiftCard.js";
import GiftCardTemplate from "../../models/GiftCardTemplate.js";
import { generateGiftCardCode, generatePin } from "../../middlewares/utils/generateGiftCard.js";

// 🟢 Purchase gift card (after payment success)
export const purchaseGiftCard = async (req, res) => {
    try {
        const { templateId, amount, recipient, message } = req.body;

        if (!templateId || !amount || !recipient?.name || !recipient?.email) {
            return res.status(400).json({ message: "Template, amount, recipient name and email are required" });
        }

        // ✅ Check template
        const template = await GiftCardTemplate.findById(templateId);
        if (!template) return res.status(404).json({ message: "Gift card template not found" });

        if (amount < template.minAmount || amount > template.maxAmount) {
            return res.status(400).json({ message: `Amount must be between ${template.minAmount} and ${template.maxAmount}` });
        }

        const giftCard = new GiftCard({
            templateId,
            code: generateGiftCardCode(),
            pin: generatePin(),
            amount,
            balance: amount,
            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // 1 year
            recipient,
            sender: { name: req.user.name, phone: req.user.phone },
            message,
            status: "active"
        });

        await giftCard.save();
        res.status(201).json({ message: "Gift card purchased", giftCard });
    } catch (err) {
        res.status(500).json({ message: "Failed to purchase gift card", error: err.message });
    }
};

// 🟢 Redeem gift card
export const redeemGiftCard = async (req, res) => {
    try {
        const { code, pin, orderAmount } = req.body;

        const giftCard = await GiftCard.findOne({ code, pin });
        if (!giftCard) return res.status(404).json({ message: "Invalid gift card" });
        if (giftCard.expiryDate < new Date()) return res.status(400).json({ message: "Gift card expired" });
        if (giftCard.balance <= 0) return res.status(400).json({ message: "Gift card has no balance" });

        const amountToDeduct = Math.min(orderAmount, giftCard.balance);
        giftCard.balance -= amountToDeduct;

        if (giftCard.balance === 0) giftCard.status = "redeemed";
        await giftCard.save();

        res.json({
            message: "Gift card redeemed",
            appliedAmount: amountToDeduct,
            remainingBalance: giftCard.balance
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to redeem gift card", error: err.message });
    }
};

// 🟢 Check balance
export const checkGiftCardBalance = async (req, res) => {
    try {
        const { code, pin } = req.params;
        const giftCard = await GiftCard.findOne({ code, pin });
        if (!giftCard) return res.status(404).json({ message: "Invalid gift card" });

        res.json({
            balance: giftCard.balance,
            expiryDate: giftCard.expiryDate,
            status: giftCard.status
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to check balance", error: err.message });
    }
};

// 🟢 Get logged-in user’s sent gift cards
export const getMyGiftCards = async (req, res) => {
    try {
        const giftCards = await GiftCard.find({ "sender.name": req.user.name }).populate("templateId");
        res.json(giftCards);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch gift cards", error: err.message });
    }
};
