import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Affiliate from '../../models/Affiliate.js';

import axios from "axios";
import { getShiprocketToken } from "../../middlewares/services/shiprocket.js"; // helper to fetch token
// helper to normalize statuses
function mapShipmentStatus(status) {
    if (!status) return "Pending";

    const map = {
        Created: "Order Placed",
        "In Transit": "Shipped",
        "Out For Delivery": "Out for Delivery",
        Delivered: "Delivered",
        Cancelled: "Cancelled",
        Returned: "Returned"
    };

    return map[status] || status; // fallback to raw if unknown
}

export const getUserOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id })
            .populate("products.productId")
            .sort({ createdAt: -1 });

        const cleanedOrders = orders.map(order => {
            const shipmentStatus = mapShipmentStatus(order.shipment?.status);
            const combinedStatus = shipmentStatus || order.status;
            const statusLabel = shipmentStatus || order.status;

            return {
                orderId: order.orderId,
                orderNumber: order.orderNumber,
                date: order.date,
                status: order.status, // raw DB status
                shipmentStatus, // normalized
                combinedStatus,
                statusLabel,
                amount: order.amount,
                discountAmount: order.discountAmount || 0,
                discountCode: order.discountCode || null,
                buyerDiscountAmount: order.buyerDiscountAmount || 0,
                shippingAddress: order.shippingAddress || null,
                products: order.products.map(item => {
                    const product = item.productId;
                    return {
                        productId: product?._id,
                        name: product?.name || "Unknown Product",
                        variant: product?.variant || null,
                        brand: product?.brand || null,
                        category: product?.category || null,
                        image: product?.images?.[0] || null,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.quantity * item.price,
                    };
                }),
                payment: {
                    method: order.paymentMethod || "Manual",
                    status: order.paymentStatus || "pending",
                    transactionId: order.transactionId || null,
                },
                expectedDelivery:
                    order.expectedDelivery ||
                    new Date(order.date.getTime() + 5 * 24 * 60 * 60 * 1000), // +5 days fallback
                shipment: order.shipment
                    ? {
                        shipment_id: order.shipment.shipment_id,
                        awb_code: order.shipment.awb_code,
                        courier: order.shipment.courier,
                        status: shipmentStatus,
                        tracking_url: order.shipment.tracking_url || null,
                        track_now: order.shipment.tracking_url || null,
                    }
                    : null,
            };
        });

        res.status(200).json({ orders: cleanedOrders });
    } catch (err) {
        console.error("🔥 Error fetching user orders:", err);
        res.status(500).json({ message: "Failed to fetch orders" });
    }
};

export const initiateOrderFromCart = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('cart.product');
        if (!user) {
            return res.status(404).json({ message: "❌ User not found" });
        }
        if (!user.cart || user.cart.length === 0) {
            return res.status(400).json({ message: "🛒 Cart is empty" });
        }

        // ✅ Calculate total from cart
        let totalAmount = 0;
        const productsForOrder = user.cart.map(item => {
            const product = item.product;
            if (!product) return null;
            const subTotal = product.price * item.quantity;
            totalAmount += subTotal;
            return {
                productId: product._id,
                quantity: item.quantity,
                price: product.price,
            };
        }).filter(Boolean);

        // 🎯 Discounts
        let discountAmount = 0;
        let discountCode = null;
        if (req.discount) {
            const isUsageValid = !req.discount.totalLimit || req.discount.usageCount < req.discount.totalLimit;
            if (isUsageValid) {
                discountAmount = req.discount.type === 'Flat'
                    ? req.discount.value
                    : Math.round((req.discount.value / 100) * totalAmount);
                discountCode = req.discount.code;
            }
        }

        // 🎯 Affiliate
        let buyerDiscountAmount = 0;
        let affiliateId = null;
        const refCode = req.query.ref;
        if (refCode) {
            const affiliate = await Affiliate.findOne({ referralCode: refCode, status: 'approved' });
            if (affiliate) {
                buyerDiscountAmount = Math.round(totalAmount * 0.10);
                affiliateId = affiliate._id;
            }
        }

        const finalAmount = totalAmount - discountAmount - buyerDiscountAmount;

        // 🔢 Order meta
        const latestOrder = await Order.findOne().sort({ createdAt: -1 });
        const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
        const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const customOrderId = `CUSTOM-${Date.now()}`;

        // ✅ Save order
        const newOrder = new Order({
            products: productsForOrder,
            orderId,
            orderNumber: nextOrderNumber,
            customOrderId,
            user: user._id,
            customerName: user.name,
            date: new Date(),
            status: "Pending",
            orderType: "Online",
            amount: finalAmount,
            discount: req.discount?._id || null,
            discountCode,
            discountAmount,
            buyerDiscountAmount,
            affiliate: affiliateId,
            paid: false,
            paymentStatus: "pending",
        });

        await newOrder.save();

        res.status(200).json({
            message: "✅ Order initiated",
            orderId: newOrder._id,
            displayOrderId: newOrder.orderId,
            totalAmount,
            discountAmount,
            buyerDiscountAmount,
            finalAmount,
        });
    } catch (err) {
        console.error("🔥 Error initiating order:", err);
        return res.status(500).json({ message: "Failed to initiate order", error: err.message });
    }
};



// export const getOrderTracking = async (req, res) => {

//     try {
//         const { id } = req.params;
//         const order = await Order.findById(id).populate("products.productId");
//         if (!order) {
//             return res.status(404).json({ message: "Order not found" });
//         }

//         res.json({
//             orderId: order._id,
//             status: order.orderStatus,              // Pending, Processing, etc.
//             shipment: order.shipment || null,       // awb_code, tracking_url, status
//             products: order.products.map(item => ({
//                 name: item.productId.name,
//                 variant: item.productId.variant,
//                 price: item.price,
//                 quantity: item.quantity,
//                 image: item.productId.images[0],
//                 brand: item.productId.brand,
//             })),
//             amount: order.amount,
//             payment: {
//                 transactionId: order.transactionId,
//                 method: order.paymentMethod,
//                 status: order.paymentStatus,
//             },
//             shippingAddress: order.shippingAddress, // full address object
//             createdAt: order.createdAt
//         });

//     } catch (err) {
//         res.status(500).json({ message: "Failed to fetch order tracking", error: err.message });
//     }
// };






export const getOrderTracking = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id).populate("products.productId");
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        let liveTracking = null;

        // ✅ If order has AWB code, fetch live tracking from Shiprocket
        if (order.shipment?.awb_code) {
            const token = await getShiprocketToken();
            try {
                const trackRes = await axios.get(
                    `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                liveTracking = trackRes.data;
            } catch (err) {
                console.error("❌ Shiprocket tracking fetch failed:", err.response?.data || err.message);
            }
        }

        res.json({
            orderId: order._id,
            status: order.orderStatus, // Pending, Processing, Shipped, etc.
            shipment: {
                shipment_id: order.shipment?.shipment_id || null,
                awb_code: order.shipment?.awb_code || null,
                tracking_url: order.shipment?.tracking_url || null,
                courier_id: order.shipment?.courier_id || null,
                courier_name: liveTracking?.tracking_data?.courier_name || order.shipment?.courier_name || null,
                current_status:
                    liveTracking?.tracking_data?.shipment_status ||
                    order.shipment?.status ||
                    "Created",
                checkpoints: liveTracking?.tracking_data?.shipment_track || [],
            },
            products: order.products.map((item) => ({
                name: item.productId.name,
                variant: item.productId.variant,
                price: item.price,
                quantity: item.quantity,
                image: item.productId.images[0],
                brand: item.productId.brand,
            })),
            amount: order.amount,
            payment: {
                transactionId: order.transactionId,
                method: order.paymentMethod,
                status: order.paymentStatus,
            },
            shippingAddress: order.shippingAddress,
            createdAt: order.createdAt,
        });
    } catch (err) {
        res.status(500).json({
            message: "Failed to fetch order tracking",
            error: err.message,
        });
    }
};
