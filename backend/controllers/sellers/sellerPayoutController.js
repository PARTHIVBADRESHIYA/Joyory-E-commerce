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
                    pendingAmount: 0,
                    uniqueBuyers: 0,
                    topPaymentMethods: {},
                    lastPayoutDate: null,
                    nextExpectedPayout: null,
                    payoutSuccessRate: "0%"
                },
                data: []
            });
        }

        // Transform payouts with enriched entries
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

        const summary = {
            totalPayouts: payouts.length,
            totalGrossSales: Number(payouts.reduce((sum, p) => sum + (p.grossAmount || 0), 0).toFixed(2)),
            totalCommission: Number(payouts.reduce((sum, p) => sum + (p.commissionAmount || 0), 0).toFixed(2)),
            totalRefunds: Number(payouts.reduce((sum, p) => sum + (p.refunds || 0), 0).toFixed(2)),
            totalFees: Number(payouts.reduce((sum, p) => sum + (p.fees || 0), 0).toFixed(2)),
            totalAdjustments: Number(payouts.reduce((sum, p) => sum + (p.adjustments || 0), 0).toFixed(2)),
            totalTaxDeducted: Number(payouts.reduce((sum, p) => sum + (p.taxDeducted || 0), 0).toFixed(2)),
            totalTdsDeducted: Number(payouts.reduce((sum, p) => sum + (p.tdsDeducted || 0), 0).toFixed(2)),
            totalEarnings: Number(
                payouts
                    .reduce(
                        (sum, p) =>
                            sum +
                            ((p.grossAmount || 0) -
                                ((p.commissionAmount || 0) +
                                    (p.refunds || 0) +
                                    (p.fees || 0) +
                                    (p.taxDeducted || 0) +
                                    (p.tdsDeducted || 0))),
                        0
                    )
                    .toFixed(2)
            ),
            totalNetPaid: Number(
                payouts
                    .filter((p) => p.status === "paid")
                    .reduce((sum, p) => sum + (p.netPayable || 0), 0)
                    .toFixed(2)
            ),
            pendingAmount: Number(
                payouts
                    .filter((p) => ["pending", "processing", "approved"].includes(p.status))
                    .reduce((sum, p) => sum + (p.netPayable || 0), 0)
                    .toFixed(2)
            ),
            uniqueBuyers: new Set(
                payouts.flatMap((p) => p.entries.map((e) => e.orderId?.user?.toString()))
            ).size,
            topPaymentMethods: (() => {
                const counts = {};
                payouts.forEach((p) =>
                    p.entries.forEach((e) => {
                        const method = e.payment?.method;
                        if (method) counts[method] = (counts[method] || 0) + 1;
                    })
                );
                return counts;
            })(),
            lastPayoutDate: payouts.find((p) => p.status === "paid")?.processedAt || null,
            nextExpectedPayout: payouts
                .filter((p) => ["pending", "processing", "approved"].includes(p.status))
                .map((p) => p.expectedPayoutDate)
                .filter(Boolean)
                .sort((a, b) => new Date(a) - new Date(b))[0] || null,
            payoutSuccessRate:
                payouts.length > 0
                    ? (
                        (payouts.filter((p) => p.status === "paid").length / payouts.length) *
                        100
                    ).toFixed(2) + "%"
                    : "0%"
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
