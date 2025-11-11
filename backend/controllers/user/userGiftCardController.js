import GiftCard from "../../models/GiftCard.js";
import GiftCardTemplate from "../../models/GiftCardTemplate.js";
import { generateGiftCardCode, generatePin } from "../../middlewares/utils/generateGiftCard.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { sendEmail } from "../../middlewares/utils/emailService.js"; // nodemailer util

// Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------- Step 1: Create Razorpay Order -------------------
// POST /api/giftcard/create-order
export const createGiftCardOrder = async (req, res) => {
    try {
        const { templateId, amount, recipient, message } = req.body;

        if (!templateId || !amount || !recipient?.name || !recipient?.email) {
            return res.status(400).json({ message: "Template, amount, recipient name and email are required" });
        }

        // Validate template
        const template = await GiftCardTemplate.findById(templateId);
        if (!template) return res.status(404).json({ message: "Gift card template not found" });

        if (amount < template.minAmount || amount > template.maxAmount) {
            return res.status(400).json({ message: `Amount must be between ${template.minAmount} and ${template.maxAmount}` });
        }

        const userId = req.user._id.toString();
        const receipt = `giftcard_${userId.slice(-6)}_${Date.now().toString().slice(-6)}`;

        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: amount * 100, // paise
            currency: "INR",
            receipt,
            notes: {
                userId,
                templateId,
                recipientName: recipient.name,
                recipientEmail: recipient.email,
                message,
                senderName: req.user.name,
                senderPhone: req.user.phone,
            },
        });

        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ message: "Error creating gift card order", error: err.message });
    }
};

// ------------------- Step 2: Verify Payment & Issue Gift Card -------------------
// POST /api/giftcard/verify-payment
export const verifyGiftCardPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ message: "Invalid Razorpay payload" });
        }

        // Verify Razorpay signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: "Payment verification failed" });
        }

        // Fetch Razorpay order
        const order = await razorpay.orders.fetch(razorpay_order_id);
        const amountInRupees = order.amount / 100;
        const notes = order.notes;

        // ✅ Create & Save Gift Card
        const giftCard = new GiftCard({
            templateId: notes.templateId,
            code: generateGiftCardCode(),
            pin: generatePin(),
            amount: amountInRupees,
            balance: amountInRupees,
            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // 1 year validity
            recipient: { name: notes.recipientName, email: notes.recipientEmail },
            sender: { name: notes.senderName, phone: notes.senderPhone },
            message: notes.message || "",
            status: "active",
        });

        await giftCard.save();

        // ✅ Send email to recipient
        try {
            console.log("📧 Sending gift card email to:", notes.recipientEmail);

            const emailResult = await sendEmail(
                notes.recipientEmail,
                "🎁 You’ve received a Joyory Gift Card!",
                `
                    <h2>Hello ${notes.recipientName},</h2>
                    <p><b>${notes.senderName}</b> has sent you a gift card worth <b>₹${amountInRupees}</b>!</p>
                    <p><b>Gift Card Code:</b> ${giftCard.code}</p>
                    <p><b>PIN:</b> ${giftCard.pin}</p>
                    <p><b>Expiry Date:</b> ${giftCard.expiryDate.toDateString()}</p>
                    <p><b>Message:</b> ${notes.message || "Enjoy your gift!"}</p>
                    <br/>
                    <p>Happy Shopping on Joyory 💄✨</p>
                `
            );

            console.log("✅ Email sent:", emailResult.messageId || emailResult);

        } catch (emailErr) {
            console.error("❌ Gift card email failed:", emailErr.message);
        }

        res.json({
            success: true,
            message: "Gift card issued successfully",
            giftCard,
        });

    } catch (err) {
        console.error("❌ Gift card payment verification error:", err.message);
        res.status(500).json({
            success: false,
            message: "Error verifying payment",
            error: err.message,
        });
    }
};


// ------------------- Redeem Gift Card -------------------
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
            success: true,
            message: "Gift card redeemed",
            appliedAmount: amountToDeduct,
            remainingBalance: giftCard.balance,
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to redeem gift card", error: err.message });
    }
};

// ------------------- Check Gift Card Balance -------------------
export const checkGiftCardBalance = async (req, res) => {
    try {
        const { code, pin } = req.params;

        if (!code || !pin) {
            return res.status(400).json({
                success: false,
                message: "Gift card code and pin are required",
            });
        }

        const giftCard = await GiftCard.findOne({ code: code.trim(), pin: pin.trim() });

        if (!giftCard) {
            return res.status(404).json({
                success: false,
                message: "Invalid gift card or pin",
            });
        }

        if (giftCard.expiryDate < new Date()) {
            return res.status(400).json({
                success: false,
                message: "This gift card has expired",
                expiryDate: giftCard.expiryDate,
            });
        }

        if (giftCard.balance <= 0) {
            return res.status(400).json({
                success: false,
                message: "Gift card balance is ₹0. Cannot be used",
                balance: giftCard.balance,
            });
        }

        res.json({
            success: true,
            message: "Gift card is valid 🎉",
            code: giftCard.code,
            balance: giftCard.balance,
            expiryDate: giftCard.expiryDate,
            status: giftCard.status,
        });
    } catch (err) {
        console.error("checkGiftCardBalance error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to check gift card balance",
            error: err.message,
        });
    }
};

export const getMyGiftCardsList = async (req, res) => {
    try {
        const giftCards = await GiftCard.find({ "sender.name": req.user.name })
            .populate("templateId", "title image"); // only get title & image

        if (!giftCards.length) {
            return res.status(404).json({
                success: false,
                message: "You have not sent any gift cards yet",
                giftCards: [],
            });
        }

        // Map to minimal info
        const listData = giftCards.map(gc => ({
            _id: gc._id,
            title: gc.templateId?.title || "No title",
            image: gc.templateId?.image || null,
        }));

        res.json({
            success: true,
            total: listData.length,
            giftCards: listData,
        });
    } catch (err) {
        console.error("getMyGiftCardsList error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch gift cards",
            error: err.message,
        });
    }
};



export const getGiftCardDetails = async (req, res) => {
    try {
        const { id } = req.params; // gift card id
        const gc = await GiftCard.findById(id).populate("templateId");

        if (!gc) {
            return res.status(404).json({
                success: false,
                message: "Gift card not found",
            });
        }

        // calculate used amount
        const usedAmount = gc.amount - gc.balance;
        const statusMessage = gc.expiryDate < new Date()
            ? "Expired"
            : gc.balance <= 0
                ? "No balance left"
                : "Active and usable";

        const details = {
            _id: gc._id,
            code: gc.code,
            pin: gc.pin,
            initialAmount: gc.amount,
            usedAmount,
            balance: gc.balance,
            expiryDate: gc.expiryDate,
            status: gc.status,
            statusMessage,
            template: gc.templateId
                ? {
                    title: gc.templateId.title,
                    description: gc.templateId.description,
                    image: gc.templateId.image,
                }
                : null,
            sender: gc.sender,
            receiver: gc.receiver,
        };

        res.json({
            success: true,
            giftCard: details,
        });
    } catch (err) {
        console.error("getGiftCardDetails error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch gift card details",
            error: err.message,
        });
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
