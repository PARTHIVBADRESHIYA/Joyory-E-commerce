import Order from '../../models/Order.js';
import Product from '../../models/Product.js';
import PayoutLedger from '../../models/PayoutLedger.js';
import Seller from '../../models/Seller.js';

export async function generatePayoutForSeller(sellerId, periodStart = null, periodEnd = null) {
    const start = periodStart || new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const end = periodEnd || new Date();

    // find orders delivered in the period
    const orders = await Order.find({
        createdAt: { $gte: start, $lte: end },
        $or: [
            { 'splitOrders.seller': sellerId },
            { 'products.productId': { $exists: true } } // fallback; we'll filter later
        ]
    }).populate('products.productId');

    let gross = 0;
    const entries = [];
    for (const order of orders) {
        // prefer splitOrders if present
        if (order.splitOrders && order.splitOrders.length) {
            const split = order.splitOrders.find(s => s.seller?.toString() === sellerId.toString());
            if (split && (split.status === 'delivered' || split.status === 'shipped' || split.status === 'processing')) {
                gross += split.amount || split.items.reduce((s, i) => s + (i.price * i.qty), 0);
                entries.push({ orderId: order.orderId, type: 'sale', amount: split.amount || 0 });
            }
        } else {
            // fallback: look for products belonging to seller
            let sellerAmount = 0;
            for (const p of order.products) {
                const prod = p.productId;
                if (!prod) continue;
                if (prod.seller && prod.seller.toString() === sellerId.toString()) {
                    sellerAmount += (p.price * p.quantity || p.quantity * p.price || 0);
                }
            }
            if (sellerAmount > 0 && order.orderStatus === 'Delivered') {
                gross += sellerAmount;
                entries.push({ orderId: order.orderId, type: 'sale', amount: sellerAmount });
            }
        }
    }

    const seller = await Seller.findById(sellerId);
    const commission = gross * (seller?.commissionRate ?? 0.15);
    const fees = 0; // gateway fees if you want to include
    const refunds = 0; // integrate refund detection if needed
    const net = gross - commission - fees - refunds;

    const ledger = await PayoutLedger.create({
        seller: sellerId,
        periodStart: start,
        periodEnd: end,
        grossAmount: gross,
        commissionAmount: commission,
        refunds,
        fees,
        netPayable: net,
        entries,
        status: 'pending'
    });

    return ledger;
}

// placeholder executePayout - implement actual gateway transfer here
export async function executePayout(ledgerId) {
    const ledger = await PayoutLedger.findById(ledgerId).populate('seller');
    if (!ledger) throw new Error('Ledger not found');
    if (ledger.status !== 'pending') throw new Error('Ledger not pending');
    try {
        ledger.status = 'processing';
        await ledger.save();

        // TODO: call Razorpay Payouts or other bank transfer API using beneficiary details
        // Example approach:
        // 1) Add beneficiary via API with seller.bankDetails
        // 2) Create payout for ledger.netPayable
        // 3) Save gatewayTransactionId and mark paid

        ledger.status = 'paid';
        ledger.gatewayTransactionId = `mock_${Date.now()}`;
        await ledger.save();
        return ledger;
    } catch (err) {
        ledger.status = 'failed';
        await ledger.save();
        throw err;
    }
}
