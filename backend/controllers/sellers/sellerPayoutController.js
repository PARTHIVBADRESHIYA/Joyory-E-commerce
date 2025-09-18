// import PayoutLedger from "../../models/PayoutLedger.js";
// import { generatePayoutForSeller } from "../../middlewares/services/payoutService.js";

// // ================= GET PAYOUTS =================
// export const getPayouts = async (req, res) => {
//     try {
//         if (!req.seller || !req.seller._id) {
//             return res.status(401).json({ message: "Unauthorized: Seller not found" });
//         }

//         const payouts = await PayoutLedger.find({ seller: req.seller._id })
//             .populate("seller", "name email bankDetails upiId gst pan") // add compliance fields
//             .sort({ createdAt: -1 });

//         if (!payouts.length) {
//             return res.json({
//                 summary: {
//                     totalPayouts: 0,
//                     totalEarnings: 0,
//                     totalNetPaid: 0,
//                     pendingAmount: 0
//                 },
//                 data: []
//             });
//         }

//         // Transform for dashboard
//         const response = payouts.map(p => ({
//             id: p._id,
//             seller: {
//                 id: p.seller?._id,
//                 name: p.seller?.name,
//                 email: p.seller?.email,
//                 bankDetails: p.seller?.bankDetails,
//                 upiId: p.seller?.upiId,
//                 gst: p.seller?.gst,
//                 pan: p.seller?.pan
//             },
//             period: {
//                 start: p.periodStart,
//                 end: p.periodEnd
//             },
//             grossAmount: p.grossAmount,
//             commission: p.commissionAmount,
//             refunds: p.refunds,
//             fees: p.fees,
//             adjustments: p.adjustments,
//             taxDeducted: p.taxDeducted,
//             tdsDeducted: p.tdsDeducted, // for Indian compliance
//             netPayable: p.netPayable,
//             settlementCycle: p.settlementCycle || "weekly",
//             currency: p.currency || "INR",
//             status: p.status,
//             payoutMethod: p.payoutMethod || "bank_transfer",
//             transactionId: p.gatewayTransactionId,
//             bankReferenceId: p.bankReferenceId, // UTR / IMPS ref
//             failureReason: p.failureReason,
//             processedAt: p.processedAt,
//             expectedPayoutDate: p.expectedPayoutDate, // for pending payouts
//             remarks: p.remarks,
//             supportTicketId: p.supportTicketId,
//             downloadUrl: p.downloadUrl, // link to PDF/CSV statement
//             entries: {
//                 orders: p.entries.filter(e => e.type === "order"),
//                 refunds: p.entries.filter(e => e.type === "refund"),
//                 fees: p.entries.filter(e => e.type === "fee"),
//                 adjustments: p.entries.filter(e => e.type === "adjustment"),
//                 payments: p.entries.filter(e => e.type === "payment")
//             },
//             createdAt: p.createdAt
//         }));

//         // Dashboard summary cards
//         const summary = {
//             // Core stats
//             totalPayouts: payouts.length,  // how many payout cycles completed
//             totalGrossSales: payouts.reduce((sum, p) => sum + (p.grossAmount || 0), 0), // before deductions

//             // Deduction insights
//             totalCommission: payouts.reduce((sum, p) => sum + (p.commissionAmount || 0), 0),
//             totalRefunds: payouts.reduce((sum, p) => sum + (p.refunds || 0), 0),
//             totalFees: payouts.reduce((sum, p) => sum + (p.fees || 0), 0),
//             totalAdjustments: payouts.reduce((sum, p) => sum + (p.adjustments || 0), 0),
//             totalTaxDeducted: payouts.reduce((sum, p) => sum + (p.taxDeducted || 0), 0),
//             totalTdsDeducted: payouts.reduce((sum, p) => sum + (p.tdsDeducted || 0), 0),

//             // Net amounts (what sellers really care about)
//             totalEarnings: payouts.reduce((sum, p) => sum + (p.grossAmount - (p.commissionAmount + p.refunds + p.fees + p.taxDeducted + p.tdsDeducted)), 0),
//             totalNetPaid: payouts.filter(p => p.status === "paid").reduce((sum, p) => sum + (p.netPayable || 0), 0),
//             pendingAmount: payouts.filter(p => ["pending", "processing", "approved"].includes(p.status)).reduce((sum, p) => sum + (p.netPayable || 0), 0),

//             // Cycle info
//             lastPayoutDate: payouts.find(p => p.status === "paid")?.processedAt || null,
//             nextExpectedPayout: payouts.find(p => ["pending", "processing"].includes(p.status))?.expectedPayoutDate || null,

//             // Ratios (analytics like Amazon/Flipkart show)
//             payoutSuccessRate: payouts.length > 0
//                 ? ((payouts.filter(p => p.status === "paid").length / payouts.length) * 100).toFixed(2) + "%"
//                 : "0%",

//             avgSettlementTime: (() => {
//                 const paid = payouts.filter(p => p.status === "paid" && p.processedAt && p.periodEnd);
//                 if (!paid.length) return null;
//                 const totalDays = paid.reduce((sum, p) => sum + Math.max(0, (p.processedAt - p.periodEnd) / (1000 * 60 * 60 * 24)), 0);
//                 return (totalDays / paid.length).toFixed(1) + " days";
//             })(),
//         };

//         return res.json({ summary, data: response });
//     } catch (err) {
//         console.error("Get payouts error:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };
// // ================= REQUEST PAYOUT =================
// export const requestPayout = async (req, res) => {
//     try {
//         if (!req.seller || !req.seller._id) {
//             return res.status(401).json({ message: "Unauthorized: Seller not found" });
//         }

//         const ledger = await generatePayoutForSeller(req.seller._id);

//         return res.json({
//             message: "Payout ledger generated successfully",
//             payout: {
//                 id: ledger._id,
//                 period: {
//                     start: ledger.periodStart,
//                     end: ledger.periodEnd
//                 },
//                 grossAmount: ledger.grossAmount,
//                 commission: ledger.commissionAmount,
//                 refunds: ledger.refunds,
//                 fees: ledger.fees,
//                 adjustments: ledger.adjustments,
//                 taxDeducted: ledger.taxDeducted,
//                 netPayable: ledger.netPayable,
//                 status: ledger.status,
//                 settlementCycle: ledger.settlementCycle,
//                 currency: ledger.currency,
//                 payoutMethod: ledger.payoutMethod,
//                 createdAt: ledger.createdAt
//             }
//         });
//     } catch (err) {
//         console.error("Request payout error:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };




































import PayoutLedger from "../../models/PayoutLedger.js";
import Payment from "../../models/settings/payments/Payment.js";
import Order from "../../models/Order.js";
import { generatePayoutForSeller } from "../../middlewares/services/payoutService.js";

// ================= GET PAYOUTS =================
export const getPayouts = async (req, res) => {
    try {
        if (!req.seller || !req.seller._id) {
            return res.status(401).json({ message: "Unauthorized: Seller not found" });
        }

        const payouts = await PayoutLedger.find({ seller: req.seller._id })
            .populate("seller", "name email bankDetails upiId gst pan")
            .populate({
                path: "entries.orderId",
                populate: [
                    { path: "user", select: "name email phone addresses" },
                    { path: "products.productId", select: "name price" }
                ]
            })
            .sort({ createdAt: -1 });

        if (!payouts.length) {
            return res.json({
                summary: {
                    totalPayouts: 0,
                    totalEarnings: 0,
                    totalNetPaid: 0,
                    pendingAmount: 0
                },
                data: []
            });
        }

        // Transform for dashboard with user + payment enrichment
        const response = await Promise.all(
            payouts.map(async (p) => {
                const enrichedEntries = await Promise.all(
                    p.entries.map(async (e) => {
                        if (!e.orderId) return e;

                        const order = e.orderId;
                        const payment = await Payment.findOne({ order: order._id }).lean();

                        return {
                            orderId: order._id,
                            orderNumber: order.orderNumber,
                            customer: order.user
                                ? {
                                    id: order.user._id,
                                    name: order.user.name,
                                    email: order.user.email,
                                    phone: order.user.phone,
                                    address: order.user.addresses?.[0] || null
                                }
                                : null,
                            products: order.products.map((pr) => ({
                                id: pr.productId?._id,
                                name: pr.productId?.name,
                                qty: pr.quantity,
                                price: pr.price
                            })),
                            payment: payment
                                ? {
                                    method: payment.method,
                                    status: payment.status,
                                    transactionId: payment.transactionId,
                                    amount: payment.amount,
                                    maskedCard: payment.cardNumber
                                        ? "**** **** **** " + payment.cardNumber.slice(-4)
                                        : null
                                }
                                : null,
                            type: e.type,
                            amount: e.amount,
                            createdAt: e.createdAt
                        };
                    })
                );

                return {
                    id: p._id,
                    seller: {
                        id: p.seller?._id,
                        name: p.seller?.name,
                        email: p.seller?.email,
                        gst: p.seller?.gst,
                        pan: p.seller?.pan
                    },
                    period: { start: p.periodStart, end: p.periodEnd },
                    grossAmount: p.grossAmount,
                    commission: p.commissionAmount,
                    refunds: p.refunds,
                    fees: p.fees,
                    adjustments: p.adjustments,
                    taxDeducted: p.taxDeducted,
                    tdsDeducted: p.tdsDeducted,
                    netPayable: p.netPayable,
                    settlementCycle: p.settlementCycle || "daily",
                    currency: p.currency || "INR",
                    status: p.status,
                    payoutMethod: p.payoutMethod || "bank_transfer",
                    transactionId: p.gatewayTransactionId,
                    bankReferenceId: p.bankReferenceId,
                    failureReason: p.failureReason,
                    processedAt: p.processedAt,
                    expectedPayoutDate: p.expectedPayoutDate,
                    remarks: p.remarks,
                    supportTicketId: p.supportTicketId,
                    downloadUrl: p.downloadUrl,
                    entries: enrichedEntries,
                    createdAt: p.createdAt
                };
            })
        );

        // Dashboard summary cards
        const summary = {
            totalPayouts: payouts.length,
            totalGrossSales: payouts.reduce((sum, p) => sum + (p.grossAmount || 0), 0),
            totalCommission: payouts.reduce((sum, p) => sum + (p.commissionAmount || 0), 0),
            totalRefunds: payouts.reduce((sum, p) => sum + (p.refunds || 0), 0),
            totalFees: payouts.reduce((sum, p) => sum + (p.fees || 0), 0),
            totalAdjustments: payouts.reduce((sum, p) => sum + (p.adjustments || 0), 0),
            totalTaxDeducted: payouts.reduce((sum, p) => sum + (p.taxDeducted || 0), 0),
            totalTdsDeducted: payouts.reduce((sum, p) => sum + (p.tdsDeducted || 0), 0),

            // Net
            totalEarnings: payouts.reduce(
                (sum, p) =>
                    sum +
                    (p.grossAmount -
                        (p.commissionAmount + p.refunds + p.fees + p.taxDeducted + p.tdsDeducted)),
                0
            ),
            totalNetPaid: payouts
                .filter((p) => p.status === "paid")
                .reduce((sum, p) => sum + (p.netPayable || 0), 0),
            pendingAmount: payouts
                .filter((p) => ["pending", "processing", "approved"].includes(p.status))
                .reduce((sum, p) => sum + (p.netPayable || 0), 0),

            // Buyer insights
            uniqueBuyers: new Set(
                payouts.flatMap((p) => p.entries.map((e) => e.orderId?.user?.toString()))
            ).size,
            topPaymentMethods: (() => {
                const counts = {};
                payouts.forEach((p) =>
                    p.entries.forEach((e) => {
                        if (e.orderId?.paymentMethod) {
                            counts[e.orderId.paymentMethod] =
                                (counts[e.orderId.paymentMethod] || 0) + 1;
                        }
                    })
                );
                return counts;
            })(),

            lastPayoutDate: payouts.find((p) => p.status === "paid")?.processedAt || null,
            nextExpectedPayout:
                payouts.find((p) => ["pending", "processing"].includes(p.status))
                    ?.expectedPayoutDate || null,

            payoutSuccessRate:
                payouts.length > 0
                    ? ((payouts.filter((p) => p.status === "paid").length / payouts.length) * 100).toFixed(2) +
                    "%"
                    : "0%",
        };

        return res.json({ summary, data: response });
    } catch (err) {
        console.error("Get payouts error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= REQUEST PAYOUT =================
export const requestPayout = async (req, res) => {
    try {
        if (!req.seller || !req.seller._id) {
            return res.status(401).json({ message: "Unauthorized: Seller not found" });
        }

        const ledger = await generatePayoutForSeller(req.seller._id);

        return res.json({
            message: "Payout ledger generated successfully",
            payout: {
                id: ledger._id,
                period: { start: ledger.periodStart, end: ledger.periodEnd },
                grossAmount: ledger.grossAmount,
                commission: ledger.commissionAmount,
                refunds: ledger.refunds,
                fees: ledger.fees,
                adjustments: ledger.adjustments,
                taxDeducted: ledger.taxDeducted,
                netPayable: ledger.netPayable,
                status: ledger.status,
                settlementCycle: ledger.settlementCycle,
                currency: ledger.currency,
                payoutMethod: ledger.payoutMethod,
                createdAt: ledger.createdAt
            }
        });
    } catch (err) {
        console.error("Request payout error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};
