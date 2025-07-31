import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Affiliate from '../../models/Affiliate.js';

export const placeOrderFromCart = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('cart.product');
        if (!user) {
            return res.status(404).json({ message: "❌ User not found" });
        }
        if (!user.cart || user.cart.length === 0) {
            return res.status(400).json({ message: "🛒 Cart is empty" });
        }


        const { shippingAddress } = req.body;

        if (
            !shippingAddress ||
            !shippingAddress.addressLine ||
            !shippingAddress.city ||
            !shippingAddress.pincode
        ) {
            return res.status(400).json({ message: "❌ Complete shipping address is required" });
        }

        let totalAmount = 0;
        const validatedProducts = [];

        for (const item of user.cart) {
            const product = item.product;
            if (!product) continue;

            if (product.quantity < item.quantity) {
                return res.status(400).json({ message: `❌ Insufficient stock for ${product.name}` });
            }

            const subTotal = product.price * item.quantity;
            totalAmount += subTotal;

            // Update inventory
            product.quantity -= item.quantity;
            product.sales = (product.sales || 0) + item.quantity;

            product.status = product.quantity <= 0
                ? 'Out of stock'
                : product.quantity < product.thresholdValue
                    ? 'Low stock'
                    : 'In-stock';

            await product.save();

            validatedProducts.push({
                productId: product._id,
                quantity: item.quantity,
                price: product.price
            });
        }

        // 🎯 Discounts
        let discount = req.discount || null;
        let discountAmount = 0;

        if (discount) {
            const isUsageValid = !discount.totalLimit || discount.usageCount < discount.totalLimit;
            if (isUsageValid) {
                discountAmount = discount.type === 'Flat'
                    ? discount.value
                    : Math.round((discount.value / 100) * totalAmount);
            } else {
                discount = null;
            }
        }

        // 🎯 Promotions
        let promotionUsed = null;
        if (req.promotion) {
            promotionUsed = {
                promotionId: req.promotion._id,
                campaignName: req.promotion.campaignName
            };
        }

        // 🎯 Affiliate
        const refCode = req.query.ref;
        let affiliate = null;
        let buyerDiscountAmount = 0;

        if (refCode) {
            affiliate = await Affiliate.findOne({ referralCode: refCode, status: 'approved' });
            if (affiliate) {
                buyerDiscountAmount = Math.round(totalAmount * 0.10); // 10% buyer discount
            }
        }

        const finalAmount = totalAmount - discountAmount - buyerDiscountAmount;

        // 🧾 Order metadata
        const latestOrder = await Order.findOne().sort({ createdAt: -1 });
        const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
        const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const customOrderId = `CUSTOM-${Date.now()}`;

        // 📦 Create Order
        const newOrder = new Order({
            products: validatedProducts,
            orderId,
            orderNumber: nextOrderNumber,
            customOrderId,
            user: user._id,
            customerName: user.name,
            date: new Date(),
            status: "Pending",
            orderType: "Online",
            amount: finalAmount,
            shippingAddress,
            discount: discount?._id || null,
            discountCode: discount?.code || null,
            discountAmount,
            promotionUsed,
            affiliate: affiliate?._id || null,
            buyerDiscountAmount
        });

        await newOrder.save();

        // ✅ Update discount usage
        if (discount) {
            discount.usageCount = (discount.usageCount || 0) + 1;
            await discount.save();
        }

        // ✅ Update promotion attribution
        if (req.promotion) {
            req.promotion.conversions = (req.promotion.conversions || 0) + 1;
            req.promotion.orders = req.promotion.orders || [];
            req.promotion.orders.push(newOrder._id);
            await req.promotion.save();
        }

        // 🧹 Clear cart
        user.cart = [];
        await user.save();

        res.status(201).json({
            message: "✅ Order placed from cart",
            order: newOrder
        });
    } catch (err) {
        console.error('🔥 Error placing cart order:', err);
        res.status(500).json({ message: "Failed to place order", error: err.message });
    }
};

export const getUserOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id })
            .populate('products.productId')
            .sort({ createdAt: -1 });

        const cleanedOrders = orders.map(order => {
            return {
                orderId: order.orderId,
                orderNumber: order.orderNumber,
                date: order.date,
                status: order.status,
                amount: order.amount,
                discountAmount: order.discountAmount,
                discountCode: order.discountCode,
                buyerDiscountAmount: order.buyerDiscountAmount,
                shippingAddress: order.shippingAddress,
                products: order.products.map(item => {
                    const product = item.productId;
                    return {
                        productId: product._id,
                        name: product.name,
                        variant: product.variant,
                        brand: product.brand,
                        category: product.category,
                        image: product.images[0],
                        quantity: item.quantity,
                        price: item.price,
                        total: item.quantity * item.price
                    };
                }),
                paymentMethod: order.paymentMethod || 'Manual',
                transactionId: order.transactionId || null,
                expectedDelivery: order.expectedDelivery || null
            }
        });

        res.status(200).json({ orders: cleanedOrders });
    } catch (err) {
        console.error('🔥 Error fetching user orders:', err);
        res.status(500).json({ message: "Failed to fetch orders" });
    }
};

