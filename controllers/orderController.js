// controllers/orderController.js
import Order from '../models/Order.js';
import Product from '../models/Product.js';

export const addOrder = async (req, res) => {
    try {
        const { products: reqProducts, orderType, status } = req.body;
        const customerName = req.user.name;
        const userId = req.user._id;

        let totalAmount = 0;
        const validatedProducts = [];

        for (const item of reqProducts) {
            const dbProduct = await Product.findById(item.productId);

            if (!dbProduct) {
                return res.status(404).json({ message: `❌ Product not found: ${item.productId}` });
            }

            if (dbProduct.quantity < item.quantity) {
                return res.status(400).json({ message: `❌ Insufficient stock for "${dbProduct.name}"` });
            }

            const subTotal = dbProduct.price * item.quantity;
            totalAmount += subTotal;

            dbProduct.quantity -= item.quantity;
            await dbProduct.save();

            // ✅ Push only what Order schema expects
            validatedProducts.push({
                productId: dbProduct._id,
                quantity: item.quantity,
                price: dbProduct.price
            });
        }

        const amount = totalAmount;

        let discount = req.discount || null;
        let discountAmount = 0;

        if (discount) {
            const now = new Date();
            const isUsageValid = !discount.totalLimit || discount.usageCount < discount.totalLimit;

            if (isUsageValid) {
                if (discount.type === 'Flat') {
                    discountAmount = discount.value;
                } else if (discount.type === 'Percentage') {
                    discountAmount = Math.round((discount.value / 100) * amount);
                }
            } else {
                console.log("❌ Discount usage limit reached.");
                discount = null;
                discountAmount = 0;
            }
        }

        const finalAmount = amount - discountAmount;

        const latestOrder = await Order.findOne().sort({ createdAt: -1 });
        const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;

        const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const customOrderId = `CUSTOM-${Date.now()}`;

        const newOrder = new Order({
            products: validatedProducts,
            orderId,
            orderNumber: nextOrderNumber,
            customOrderId,
            user: userId,
            date: new Date(),
            customerName,
            status,
            orderType,
            amount: finalAmount,
            discount: discount?._id || null,
            discountCode: discount?.code || null,
            discountAmount
        });

        await newOrder.save();

        if (discount) {
            discount.usageCount = (discount.usageCount || 0) + 1;
            await discount.save();
        }

        res.status(201).json({ message: '✅ Order placed successfully', order: newOrder });
    } catch (error) {
        console.error('🔥 Order placement error:', error);
        res.status(500).json({ message: 'Failed to place order', error: error.message });
    }
};




export const getAllOrders = async (req, res) => {
    try {
        const { status, orderType, fromDate, toDate } = req.query;
        const query = {};

        if (status) query.status = status;
        if (orderType) query.orderType = orderType;
        if (fromDate && toDate) {
            query.date = { $gte: new Date(fromDate), $lte: new Date(toDate) };
        }

        const orders = await Order.find(query)
            .populate('products.productId', 'name')
            .sort({ createdAt: -1 });

        const formatted = orders.map(order => ({
            orderId: order.orderId,
            date: order.date.toDateString(),
            customerName: order.customerName,
            status: order.status,
            orderType: order.orderType,
            amount: `₹${order.amount}`,
            products: order.products.map(p => ({
                name: p.productId?.name || 'Unknown',
                quantity: p.quantity,
                price: `₹${p.price}`
            }))
        }));

        res.status(200).json(formatted);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch orders', error });
    }
};

// Get summary metrics for dashboard
export const getOrderSummary = async (req, res) => {
    try {
        const now = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(now.getDate() - 7);

        const totalOrders = await Order.countDocuments();
        const newOrders = await Order.countDocuments({ createdAt: { $gte: lastWeek } });
        const completedOrders = await Order.countDocuments({
            status: { $in: ['Delivered', 'Completed'] },
            createdAt: { $gte: lastWeek }
        });
        const cancelledOrders = await Order.countDocuments({ status: 'Cancelled', createdAt: { $gte: lastWeek } });

        res.status(200).json({
            totalOrders,
            newOrders,
            completedOrders,
            cancelledOrders
        });
    } catch (error) {
        res.status(500).json({ message: 'Error getting summary', error });
    }
};
