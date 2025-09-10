// // // controllers/user/userGiftCardController.js
// // import GiftCard from "../../models/GiftCard.js";
// // import GiftCardTemplate from "../../models/GiftCardTemplate.js";
// // import { generateGiftCardCode, generatePin } from "../../middlewares/utils/generateGiftCard.js";
// // import Razorpay from "razorpay";
// // import crypto from "crypto";
// // import sendEmail from "../../middlewares/utils/emailService.js"; // ✅ utility to send email (configure nodemailer)

// // // 🟢 Purchase gift card (after payment success)
// // export const purchaseGiftCard = async (req, res) => {
// //     try {
// //         const { templateId, amount, recipient, message } = req.body;

// //         if (!templateId || !amount || !recipient?.name || !recipient?.email) {
// //             return res.status(400).json({ message: "Template, amount, recipient name and email are required" });
// //         }

// //         // ✅ Check template
// //         const template = await GiftCardTemplate.findById(templateId);
// //         if (!template) return res.status(404).json({ message: "Gift card template not found" });

// //         if (amount < template.minAmount || amount > template.maxAmount) {
// //             return res.status(400).json({ message: `Amount must be between ${template.minAmount} and ${template.maxAmount}` });
// //         }

// //         const giftCard = new GiftCard({
// //             templateId,
// //             code: generateGiftCardCode(),
// //             pin: generatePin(),
// //             amount,
// //             balance: amount,
// //             expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // 1 year
// //             recipient,
// //             sender: { name: req.user.name, phone: req.user.phone },
// //             message,
// //             status: "active"
// //         });

// //         await giftCard.save();
// //         res.status(201).json({ message: "Gift card purchased", giftCard });
// //     } catch (err) {
// //         res.status(500).json({ message: "Failed to purchase gift card", error: err.message });
// //     }
// // };

// // // 🟢 Redeem gift card
// // export const redeemGiftCard = async (req, res) => {
// //     try {
// //         const { code, pin, orderAmount } = req.body;

// //         const giftCard = await GiftCard.findOne({ code, pin });
// //         if (!giftCard) return res.status(404).json({ message: "Invalid gift card" });
// //         if (giftCard.expiryDate < new Date()) return res.status(400).json({ message: "Gift card expired" });
// //         if (giftCard.balance <= 0) return res.status(400).json({ message: "Gift card has no balance" });

// //         const amountToDeduct = Math.min(orderAmount, giftCard.balance);
// //         giftCard.balance -= amountToDeduct;

// //         if (giftCard.balance === 0) giftCard.status = "redeemed";
// //         await giftCard.save();

// //         res.json({
// //             message: "Gift card redeemed",
// //             appliedAmount: amountToDeduct,
// //             remainingBalance: giftCard.balance
// //         });
// //     } catch (err) {
// //         res.status(500).json({ message: "Failed to redeem gift card", error: err.message });
// //     }
// // };

// // // 🟢 Check balance
// // export const checkGiftCardBalance = async (req, res) => {
// //     try {
// //         const { code, pin } = req.params;
// //         const giftCard = await GiftCard.findOne({ code, pin });
// //         if (!giftCard) return res.status(404).json({ message: "Invalid gift card" });

// //         res.json({
// //             balance: giftCard.balance,
// //             expiryDate: giftCard.expiryDate,
// //             status: giftCard.status
// //         });
// //     } catch (err) {
// //         res.status(500).json({ message: "Failed to check balance", error: err.message });
// //     }
// // };

// // // 🟢 Get logged-in user’s sent gift cards
// // export const getMyGiftCards = async (req, res) => {
// //     try {
// //         const giftCards = await GiftCard.find({ "sender.name": req.user.name }).populate("templateId");
// //         res.json(giftCards);
// //     } catch (err) {
// //         res.status(500).json({ message: "Failed to fetch gift cards", error: err.message });
// //     }
// // };























// import GiftCard from "../../models/GiftCard.js";
// import GiftCardTemplate from "../../models/GiftCardTemplate.js";
// import { generateGiftCardCode, generatePin } from "../../middlewares/utils/generateGiftCard.js";
// import Razorpay from "razorpay";
// import crypto from "crypto";
// import { sendEmail } from "../../middlewares/utils/emailService.js"; // configure nodemailer

// // Razorpay instance
// const razorpay = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

// // ==================== PURCHASE FLOW ==================== //

// // Step 1: Create Razorpay order
// // POST /api/giftcard/create-order
// // export const createGiftCardOrder = async (req, res) => {
// //     try {
// //         const { templateId, amount, recipient, message } = req.body;

// //         if (!templateId || !amount || !recipient?.name || !recipient?.email) {
// //             return res.status(400).json({ message: "Template, amount, recipient name and email are required" });
// //         }

// //         // Validate template
// //         const template = await GiftCardTemplate.findById(templateId);
// //         if (!template) return res.status(404).json({ message: "Gift card template not found" });

// //         if (amount < template.minAmount || amount > template.maxAmount) {
// //             return res.status(400).json({ message: `Amount must be between ${template.minAmount} and ${template.maxAmount}` });
// //         }

// //         const userId = req.user?._id?.toString() || "guest_user";
// //         const receipt = `giftcard_${userId.slice(-6)}_${Date.now().toString().slice(-6)}`;

// //         // Create Razorpay order
// //         const options = {
// //             amount: amount * 100, // paise
// //             currency: "INR",
// //             receipt,
// //             notes: {
// //                 userId,
// //                 templateId,
// //                 recipientEmail: recipient.email,
// //                 message,
// //             },
// //         };

// //         const order = await razorpay.orders.create(options);
// //         return res.json({ order });
// //     } catch (err) {
// //         return res.status(500).json({ message: "Error creating gift card order", error: err.message });
// //     }
// // };

// // // Step 2: Verify payment and issue gift card
// // // POST /api/giftcard/verify-payment
// // export const verifyGiftCardPayment = async (req, res) => {
// //     try {
// //         const {
// //             razorpay_order_id,
// //             razorpay_payment_id,
// //             razorpay_signature,
// //             templateId,
// //             amount,
// //             recipient,
// //             message,
// //         } = req.body;

// //         if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
// //             return res.status(400).json({ message: "Invalid Razorpay payload" });
// //         }

// //         // Verify signature
// //         const body = razorpay_order_id + "|" + razorpay_payment_id;
// //         const expectedSignature = crypto
// //             .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
// //             .update(body.toString())
// //             .digest("hex");

// //         if (expectedSignature !== razorpay_signature) {
// //             return res.status(400).json({ message: "Payment verification failed" });
// //         }

// //         // ✅ Issue Gift Card
// //         const giftCard = new GiftCard({
// //             templateId,
// //             code: generateGiftCardCode(),
// //             pin: generatePin(),
// //             amount,
// //             balance: amount,
// //             expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
// //             recipient,
// //             sender: { name: req.user.name, phone: req.user.phone },
// //             message,
// //             status: "active",
// //         });

// //         await giftCard.save();

// //         // Send email
// //         try {
// //             await sendEmail({
// //                 to: recipient.email,
// //                 subject: "You’ve received a Joyory Gift Card 🎁",
// //                 html: `
// //                     <h2>Hello ${recipient.name},</h2>
// //                     <p>You have received a gift card from ${req.user.name}!</p>
// //                     <p><b>Gift Card Code:</b> ${giftCard.code}</p>
// //                     <p><b>PIN:</b> ${giftCard.pin}</p>
// //                     <p><b>Amount:</b> ₹${giftCard.amount}</p>
// //                     <p><b>Expiry Date:</b> ${giftCard.expiryDate.toDateString()}</p>
// //                     <br/>
// //                     <p>Enjoy shopping on Joyory 💄✨</p>
// //                 `,
// //             });
// //         } catch (emailErr) {
// //             console.error("Email sending failed:", emailErr.message);
// //         }

// //         return res.json({ message: "Gift card issued successfully", giftCard });
// //     } catch (err) {
// //         return res.status(500).json({ message: "Error verifying payment", error: err.message });
// //     }
// // };




// // ------------------- Step 1: Create Razorpay Order -------------------
// export const createGiftCardOrder = async (req, res) => {
//     try {
//         const { templateId, amount, recipient, message } = req.body;

//         if (!templateId || !amount || !recipient?.name || !recipient?.email) {
//             return res.status(400).json({ message: "Template, amount, recipient name and email are required" });
//         }

//         // Validate template
//         const template = await GiftCardTemplate.findById(templateId);
//         if (!template) return res.status(404).json({ message: "Gift card template not found" });
//         if (amount < template.minAmount || amount > template.maxAmount) {
//             return res.status(400).json({ message: `Amount must be between ${template.minAmount} and ${template.maxAmount}` });
//         }

//         const userId = req.user._id.toString();
//         const receipt = `giftcard_${userId.slice(-6)}_${Date.now().toString().slice(-6)}`;

//         // Create Razorpay order
//         const order = await razorpay.orders.create({
//             amount: amount, // paise
//             currency: "INR",
//             receipt,
//             notes: {
//                 userId,
//                 templateId,
//                 recipientEmail: recipient.email,
//                 recipientName: recipient.name,
//                 message,
//             },
//         });

//         res.json({ order });
//     } catch (err) {
//         res.status(500).json({ message: "Error creating gift card order", error: err.message });
//     }
// };

// // ------------------- Step 2: Verify Payment & Issue Gift Card -------------------
// export const verifyGiftCardPayment = async (req, res) => {
//     try {
//         const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

//         if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
//             return res.status(400).json({ message: "Invalid Razorpay payload" });
//         }

//         // Verify Razorpay signature
//         const body = razorpay_order_id + "|" + razorpay_payment_id;
//         const expectedSignature = crypto
//             .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//             .update(body.toString())
//             .digest("hex");

//         if (expectedSignature !== razorpay_signature) {
//             return res.status(400).json({ message: "Payment verification failed" });
//         }

//         // Fetch order to get notes (amount, recipient)
//         const order = await razorpay.orders.fetch(razorpay_order_id);

//         const amountInRupees = order.amount / 100;
//         const notes = order.notes;

//         // Create gift card
//         const giftCard = new GiftCard({
//             templateId: notes.templateId,
//             code: generateGiftCardCode(),
//             pin: generatePin(),
//             amount: amountInRupees,
//             balance: amountInRupees,
//             expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
//             recipient: { name: notes.recipientName, email: notes.recipientEmail },
//             sender: { name: req.user.name, phone: req.user.phone },
//             message: notes.message || "",
//             status: "active",
//         });

//         await giftCard.save();

//         // Send email to recipient
//         try {
//             await sendEmail({
//                 to: notes.recipientEmail,
//                 subject: "You’ve received a Joyory Gift Card 🎁",
//                 html: `
//                     <h2>Hello ${notes.recipientName},</h2>
//                     <p>${req.user.name} has sent you a gift card worth ₹${amountInRupees}!</p>
//                     <p><b>Gift Card Code:</b> ${giftCard.code}</p>
//                     <p><b>PIN:</b> ${giftCard.pin}</p>
//                     <p><b>Expiry Date:</b> ${giftCard.expiryDate.toDateString()}</p>
//                     <p>Message: ${notes.message || "Enjoy your gift!"}</p>
//                     <br/>
//                     <p>Happy Shopping on Joyory 💄✨</p>
//                 `,
//             });
//         } catch (emailErr) {
//             console.error("Email sending failed:", emailErr.message);
//         }

//         res.json({ message: "Gift card issued successfully", giftCard });
//     } catch (err) {
//         res.status(500).json({ message: "Error verifying payment", error: err.message });
//     }
// };


// // ==================== REDEEM ==================== //
// export const redeemGiftCard = async (req, res) => {
//     try {
//         const { code, pin, orderAmount } = req.body;

//         const giftCard = await GiftCard.findOne({ code, pin });
//         if (!giftCard) return res.status(404).json({ message: "Invalid gift card" });
//         if (giftCard.expiryDate < new Date()) return res.status(400).json({ message: "Gift card expired" });
//         if (giftCard.balance <= 0) return res.status(400).json({ message: "Gift card has no balance" });

//         const amountToDeduct = Math.min(orderAmount, giftCard.balance);
//         giftCard.balance -= amountToDeduct;

//         if (giftCard.balance === 0) giftCard.status = "redeemed";
//         await giftCard.save();

//         res.json({
//             message: "Gift card redeemed",
//             appliedAmount: amountToDeduct,
//             remainingBalance: giftCard.balance,
//         });
//     } catch (err) {
//         res.status(500).json({ message: "Failed to redeem gift card", error: err.message });
//     }
// };

// // ==================== BALANCE ==================== //
// export const checkGiftCardBalance = async (req, res) => {
//     try {
//         const { code, pin } = req.params;
//         const giftCard = await GiftCard.findOne({ code, pin });
//         if (!giftCard) return res.status(404).json({ message: "Invalid gift card" });

//         res.json({
//             balance: giftCard.balance,
//             expiryDate: giftCard.expiryDate,
//             status: giftCard.status,
//         });
//     } catch (err) {
//         res.status(500).json({ message: "Failed to check balance", error: err.message });
//     }
// };

// // ==================== MY GIFT CARDS ==================== //
// export const getMyGiftCards = async (req, res) => {
//     try {
//         const giftCards = await GiftCard.find({ "sender.name": req.user.name }).populate("templateId");
//         res.json(giftCards);
//     } catch (err) {
//         res.status(500).json({ message: "Failed to fetch gift cards", error: err.message });
//     }
// };

















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

        // Send email to recipient
        try {
            await sendEmail({
                to: notes.recipientEmail,
                subject: "🎁 You’ve received a Joyory Gift Card!",
                html: `
                    <h2>Hello ${notes.recipientName},</h2>
                    <p><b>${notes.senderName}</b> has sent you a gift card worth <b>₹${amountInRupees}</b>!</p>
                    <p><b>Gift Card Code:</b> ${giftCard.code}</p>
                    <p><b>PIN:</b> ${giftCard.pin}</p>
                    <p><b>Expiry Date:</b> ${giftCard.expiryDate.toDateString()}</p>
                    <p><b>Message:</b> ${notes.message || "Enjoy your gift!"}</p>
                    <br/>
                    <p>Happy Shopping on Joyory 💄✨</p>
                `,
            });
        } catch (emailErr) {
            console.error("Email sending failed:", emailErr.message);
        }

        res.json({ success: true, message: "Gift card issued successfully", giftCard });
    } catch (err) {
        res.status(500).json({ message: "Error verifying payment", error: err.message });
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
        const giftCard = await GiftCard.findOne({ code, pin });
        if (!giftCard) return res.status(404).json({ message: "Invalid gift card" });

        res.json({
            success: true,
            balance: giftCard.balance,
            expiryDate: giftCard.expiryDate,
            status: giftCard.status,
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to check balance", error: err.message });
    }
};

// ------------------- Get My Gift Cards (sent by logged-in user) -------------------
export const getMyGiftCards = async (req, res) => {
    try {
        const giftCards = await GiftCard.find({ "sender.name": req.user.name }).populate("templateId");
        res.json({ success: true, giftCards });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch gift cards", error: err.message });
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
