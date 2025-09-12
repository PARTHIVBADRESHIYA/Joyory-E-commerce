// import cron from 'node-cron';
// import mongoose from 'mongoose';
// import Seller from '../../../models/Seller.js';
// import Order from '../../../models/Order.js';
// import PayoutLedger from '../../../models/PayoutLedger.js';

// // Cron job: runs daily at 12:05 AM
// cron.schedule('5 0 * * *', async () => {
//     console.log('Running daily payout job...');

//     try {
//         const sellers = await Seller.find();

//         // Previous day
//         const startOfYesterday = new Date();
//         startOfYesterday.setDate(startOfYesterday.getDate() - 1);
//         startOfYesterday.setHours(0, 0, 0, 0);

//         const endOfYesterday = new Date();
//         endOfYesterday.setDate(endOfYesterday.getDate() - 1);
//         endOfYesterday.setHours(23, 59, 59, 999);

//         for (const seller of sellers) {
//             // Get all paid orders for this seller yesterday
//             const orders = await Order.find({
//                 "splitOrders.seller": seller._id,
//                 paid: true,
//                 createdAt: { $gte: startOfYesterday, $lte: endOfYesterday }
//             });

//             // Check ledger to avoid duplicates
//             const ledgeredOrders = await PayoutLedger.find({ seller: seller._id });
//             const ledgeredOrderIds = ledgeredOrders.flatMap(l => l.entries.map(e => e.orderId));

//             const ordersToInclude = orders.filter(order =>
//                 !ledgeredOrderIds.includes(order._id.toString())
//             );

//             if (!ordersToInclude.length) continue;

//             // Compute totals
//             let grossAmount = 0;
//             let commissionAmount = 0;
//             let refunds = 0;
//             const entries = [];

//             for (const order of ordersToInclude) {
//                 const splitOrder = order.splitOrders.find(so => so.seller.toString() === seller._id.toString());
//                 if (!splitOrder) continue;

//                 grossAmount += splitOrder.amount;

//                 // Example: 10% platform commission
//                 const commission = splitOrder.amount * 0.1;
//                 commissionAmount += commission;

//                 // Optional: handle refunds per order
//                 const refundAmount = splitOrder.refundAmount || 0;
//                 refunds += refundAmount;

//                 entries.push({
//                     orderId: order._id.toString(),
//                     type: 'order',
//                     amount: splitOrder.amount
//                 });
//             }

//             const fees = 0; // optional payment processing fees
//             const netPayable = grossAmount - commissionAmount - refunds - fees;

//             const ledger = new PayoutLedger({
//                 seller: seller._id,
//                 periodStart: startOfYesterday,
//                 periodEnd: endOfYesterday,
//                 grossAmount,
//                 commissionAmount,
//                 refunds,
//                 fees,
//                 netPayable,
//                 status: 'pending',
//                 entries
//             });

//             await ledger.save();
//             console.log(`Created daily payout for seller ${seller._id}: ${netPayable}`);
//         }
//     } catch (err) {
//         console.error('Daily payout job error:', err);
//     }
// });



// import cron from 'node-cron';
// import mongoose from 'mongoose';
// import Seller from '../../../models/Seller.js';
// import Order from '../../../models/Order.js';
// import PayoutLedger from '../../../models/PayoutLedger.js';

// // Make sure DB is connected before running this file
// if (!mongoose.connection.readyState) {
//     console.error('MongoDB not connected!');
// }

// // Cron job: runs every minute for testing
// cron.schedule('* * * * *', async () => {
//     console.log('Running payout job...');

//     try {
//         const sellers = await Seller.find();
//         console.log(`Found ${sellers.length} sellers`);

//         // ===== TEST: Use today instead of yesterday =====
//         const startOfDay = new Date();
//         startOfDay.setHours(0, 0, 0, 0);

//         const endOfDay = new Date();
//         endOfDay.setHours(23, 59, 59, 999);

//         for (const seller of sellers) {
//             console.log(`Processing seller: ${seller._id}`);

//             // Get all paid orders for this seller today
//             const orders = await Order.find({
//                 "splitOrders.seller": new mongoose.Types.ObjectId(seller._id),
//                 paid: true,
//                 createdAt: { $gte: startOfDay, $lte: endOfDay }
//             });
//             console.log(`Found ${orders.length} paid orders for seller ${seller._id}`);

//             if (!orders.length) continue;

//             // ===== Skip duplicate check for first test run =====
//             const ordersToInclude = orders;

//             let grossAmount = 0;
//             let commissionAmount = 0;
//             let refunds = 0;
//             const entries = [];

//             for (const order of ordersToInclude) {
//                 const splitOrder = order.splitOrders.find(
//                     so => so.seller && so.seller.toString() === seller._id.toString()
//                 );

//                 if (!splitOrder) continue;

//                 grossAmount += splitOrder.amount;
//                 const commission = splitOrder.amount * 0.1; // 10% platform commission
//                 commissionAmount += commission;

//                 const refundAmount = splitOrder.refundAmount || 0;
//                 refunds += refundAmount;

//                 entries.push({
//                     orderId: order._id.toString(),
//                     type: 'order',
//                     amount: splitOrder.amount
//                 });
//             }

//             const fees = 0;
//             const netPayable = grossAmount - commissionAmount - refunds - fees;

//             if (netPayable <= 0) {
//                 console.log(`No net payable for seller ${seller._id}, skipping ledger`);
//                 continue;
//             }

//             const ledger = new PayoutLedger({
//                 seller: seller._id,
//                 periodStart: startOfDay,
//                 periodEnd: endOfDay,
//                 grossAmount,
//                 commissionAmount,
//                 refunds,
//                 fees,
//                 netPayable,
//                 status: 'pending',
//                 entries
//             });

//             await ledger.save();
//             console.log(`✅ Ledger created for seller ${seller._id}, netPayable: ${netPayable}`);
//         }

//         console.log('Payout job completed');
//     } catch (err) {
//         console.error('Daily payout job error:', err);
//     }
// });






// // //24 hour 
// import cron from 'node-cron';
// import mongoose from 'mongoose';
// import Seller from '../../../models/Seller.js';
// import Order from '../../../models/Order.js';
// import PayoutLedger from '../../../models/PayoutLedger.js';

// // Ensure DB is connected before running
// if (!mongoose.connection.readyState) {
//     console.error('MongoDB not connected!');
// }

// // Cron job: runs daily at 12:05 AM
// cron.schedule('5 0 * * *', async () => {
//     console.log('Running daily payout job...');

//     try {
//         const sellers = await Seller.find();
//         console.log(`Found ${sellers.length} sellers`);

//         // ===== Define start and end of yesterday =====
//         const startOfDay = new Date();
//         startOfDay.setDate(startOfDay.getDate() - 1);
//         startOfDay.setHours(0, 0, 0, 0);

//         const endOfDay = new Date();
//         endOfDay.setDate(endOfDay.getDate() - 1);
//         endOfDay.setHours(23, 59, 59, 999);

//         for (const seller of sellers) {
//             console.log(`Processing seller: ${seller._id}`);

//             // Skip if ledger already exists for this seller today
//             const existingLedger = await PayoutLedger.findOne({
//                 seller: seller._id,
//                 periodStart: startOfDay,
//                 periodEnd: endOfDay
//             });
//             if (existingLedger) {
//                 console.log(`Ledger already exists for seller ${seller._id}, skipping`);
//                 continue;
//             }

//             // Get all paid orders for this seller yesterday
//             const orders = await Order.find({
//                 "splitOrders.seller": seller._id,
//                 paid: true,
//                 createdAt: { $gte: startOfDay, $lte: endOfDay }
//             });
//             console.log(`Found ${orders.length} paid orders for seller ${seller._id}`);

//             if (!orders.length) continue;

//             // Compute totals
//             let grossAmount = 0;
//             let commissionAmount = 0;
//             let refunds = 0;
//             const entries = [];

//             for (const order of orders) {
//                 const splitOrder = order.splitOrders.find(
//                     so => so.seller && so.seller.toString() === seller._id.toString()
//                 );

//                 if (!splitOrder) continue;

//                 grossAmount += splitOrder.amount;
//                 const commission = splitOrder.amount * 0.1; // 10% platform commission
//                 commissionAmount += commission;

//                 const refundAmount = splitOrder.refundAmount || 0;
//                 refunds += refundAmount;

//                 entries.push({
//                     orderId: order._id.toString(),
//                     type: 'order',
//                     amount: splitOrder.amount
//                 });
//             }

//             const fees = 0; // optional processing fees
//             const netPayable = grossAmount - commissionAmount - refunds - fees;

//             if (netPayable <= 0) {
//                 console.log(`No net payable for seller ${seller._id}, skipping ledger`);
//                 continue;
//             }

//             // Create ledger
//             const ledger = new PayoutLedger({
//                 seller: seller._id,
//                 periodStart: startOfDay,
//                 periodEnd: endOfDay,
//                 grossAmount,
//                 commissionAmount,
//                 refunds,
//                 fees,
//                 netPayable,
//                 status: 'pending',
//                 entries
//             });

//             await ledger.save();
//             console.log(`✅ Ledger created for seller ${seller._id}, netPayable: ${netPayable}`);
//         }

//         console.log('Daily payout job completed');
//     } catch (err) {
//         console.error('Daily payout job error:', err);
//     }
// });











import cron from 'node-cron';
import mongoose from 'mongoose';
import Seller from '../../../models/Seller.js';
import Order from '../../../models/Order.js';
import PayoutLedger from '../../../models/PayoutLedger.js';

// Ensure DB is connected before running
if (!mongoose.connection.readyState) {
    console.error('MongoDB not connected!');
}

// Cron job: runs every minute for testing
cron.schedule('5 0 * * *', async () => {
    console.log('Running payout job (test every minute)...');

    try {
        const sellers = await Seller.find();
        console.log(`Found ${sellers.length} sellers`);

        // ===== Use today for testing =====
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        for (const seller of sellers) {
            console.log(`Processing seller: ${seller._id}`);

            // Skip if ledger already exists for this seller today
            const existingLedger = await PayoutLedger.findOne({
                seller: seller._id,
                periodStart: startOfDay,
                periodEnd: endOfDay
            });
            if (existingLedger) {
                console.log(`Ledger already exists for seller ${seller._id}, skipping`);
                continue;
            }

            // Get all paid orders for this seller today
            const orders = await Order.find({
                "splitOrders.seller": seller._id,
                paid: true,
                createdAt: { $gte: startOfDay, $lte: endOfDay }
            });
            console.log(`Found ${orders.length} paid orders for seller ${seller._id}`);

            if (!orders.length) continue;

            // Compute totals
            let grossAmount = 0;
            let commissionAmount = 0;
            let refunds = 0;
            const entries = [];

            for (const order of orders) {
                const splitOrder = order.splitOrders.find(
                    so => so.seller && so.seller.toString() === seller._id.toString()
                );

                if (!splitOrder) continue;

                grossAmount += splitOrder.amount;
                const commission = splitOrder.amount * 0.1; // 10% platform commission
                commissionAmount += commission;

                const refundAmount = splitOrder.refundAmount || 0;
                refunds += refundAmount;

                entries.push({
                    orderId: order._id.toString(),
                    type: 'order',
                    amount: splitOrder.amount
                });
            }

            const fees = 0; // optional processing fees
            const netPayable = grossAmount - commissionAmount - refunds - fees;

            if (netPayable <= 0) {
                console.log(`No net payable for seller ${seller._id}, skipping ledger`);
                continue;
            }

            // Create ledger
            const ledger = new PayoutLedger({
                seller: seller._id,
                periodStart: startOfDay,
                periodEnd: endOfDay,
                grossAmount,
                commissionAmount,
                refunds,
                fees,
                netPayable,
                status: 'pending',
                entries
            });

            await ledger.save();
            console.log(`✅ Ledger created for seller ${seller._id}, netPayable: ${netPayable}`);
        }

        console.log('Payout job (test) completed');
    } catch (err) {
        console.error('Daily payout job error:', err);
    }
});




// import cron from 'node-cron';
// import dotenv from 'dotenv';
// import mongoose from 'mongoose';
// import axios from 'axios';
// import Seller from '../../../models/Seller.js';
// import PayoutLedger from '../../../models/PayoutLedger.js';

// dotenv.config();

// // Ensure DB is connected
// if (!mongoose.connection.readyState) {
//     console.error('MongoDB not connected!');
// }

// // Cron job: runs every minute for testing
// cron.schedule('* * * * *', async () => {
//     console.log('Running test payout job...');

//     try {
//         const sellers = await Seller.find();
//         console.log(`Found ${sellers.length} sellers`);

//         for (const seller of sellers) {
//             console.log(`Processing seller: ${seller._id}`);

//             // ===== Fetch payments (Razorpay test or mock) =====
//             const fromTimestamp = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // last 24h
//             const toTimestamp = Math.floor(Date.now() / 1000);

//             let payments = [];
//             try {
//                 const res = await axios.get('https://api.razorpay.com/v1/payments', {
//                     params: { from: fromTimestamp, to: toTimestamp, count: 100 },
//                     auth: { username: process.env.RAZORPAY_KEY_ID, password: process.env.RAZORPAY_KEY_SECRET },
//                 });
//                 payments = res.data.items || [];
//             } catch (err) {
//                 console.error(`❌ Error fetching payments for seller ${seller._id}:`, err.response?.data || err);
//                 continue;
//             }

//             const sellerPayments = payments.filter(
//                 p => p.status === 'captured' && p.seller_id === seller.razorpay_account
//             );

//             if (!sellerPayments.length) {
//                 console.log(`No captured payments found for seller ${seller._id}`);
//                 continue;
//             }

//             // ===== Compute totals =====
//             const grossAmount = sellerPayments.reduce((sum, p) => sum + p.amount / 100, 0);
//             const commissionAmount = grossAmount * 0.1; // 10% commission
//             const netPayable = grossAmount - commissionAmount;

//             if (netPayable <= 0) {
//                 console.log(`No net payable for seller ${seller._id}, skipping ledger`);
//                 continue;
//             }

//             // ===== Create ledger =====
//             const entries = sellerPayments.map(p => ({
//                 orderId: p.id,
//                 type: 'order', // matches enum
//                 amount: p.amount / 100,
//             }));

//             const ledger = new PayoutLedger({
//                 seller: seller._id,
//                 periodStart: new Date(fromTimestamp * 1000),
//                 periodEnd: new Date(toTimestamp * 1000),
//                 grossAmount,
//                 commissionAmount,
//                 refunds: 0,
//                 fees: 0,
//                 netPayable,
//                 status: 'pending',
//                 entries,
//             });

//             await ledger.save();
//             console.log(`✅ Ledger created for seller ${seller._id}, netPayable: ${netPayable}`);

//             // ===== Simulate payout (no real Razorpay call) =====
//             const fakeTxnId = `TEST-PAYOUT-${Date.now()}`;
//             ledger.status = 'paid';
//             ledger.gatewayTransactionId = fakeTxnId;
//             await ledger.save();

//             console.log(`💰 Payout simulated for seller ${seller._id}, txnId: ${fakeTxnId}`);
//         }

//         console.log('Test payout job completed');
//     } catch (err) {
//         console.error('Test payout job error:', err);
//     }
// });
