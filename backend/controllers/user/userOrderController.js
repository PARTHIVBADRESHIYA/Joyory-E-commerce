import express from "express";
import mongoose from "mongoose";
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Affiliate from '../../models/Affiliate.js';
import Discount from "../../models/Discount.js";
import Product from "../../models/Product.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";

import {
    fetchProductsForCart,
    pickCartProducts,
    cartSubtotal,
    validateDiscountForCartInternal,
    reserveDiscountUsage
} from "../../controllers/user/userDiscountController.js"; // import helpers
import axios from "axios";
import { getShiprocketToken, createShiprocketOrder } from "../../middlewares/services/shiprocket.js"; // helper to fetch token
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

// export const initiateOrderFromCart = async (req, res) => {
//     try {
//         const user = await User.findById(req.user._id).populate('cart.product');
//         if (!user) {
//             return res.status(404).json({ message: "❌ User not found" });
//         }
//         if (!user.cart || user.cart.length === 0) {
//             return res.status(400).json({ message: "🛒 Cart is empty" });
//         }

//         // ✅ Calculate total from cart
//         let totalAmount = 0;
//         const productsForOrder = user.cart.map(item => {
//             const product = item.product;
//             if (!product) return null;
//             const subTotal = product.price * item.quantity;
//             totalAmount += subTotal;
//             return {
//                 productId: product._id,
//                 quantity: item.quantity,
//                 price: product.price,
//             };
//         }).filter(Boolean);

//         // 🎯 Discounts
//         let discountAmount = 0;
//         let discountCode = null;
//         if (req.discount) {
//             const isUsageValid = !req.discount.totalLimit || req.discount.usageCount < req.discount.totalLimit;
//             if (isUsageValid) {
//                 discountAmount = req.discount.type === 'Flat'
//                     ? req.discount.value
//                     : Math.round((req.discount.value / 100) * totalAmount);
//                 discountCode = req.discount.code;
//             }
//         }

//         // 🎯 Affiliate
//         let buyerDiscountAmount = 0;
//         let affiliateId = null;
//         const refCode = req.query.ref;
//         if (refCode) {
//             const affiliate = await Affiliate.findOne({ referralCode: refCode, status: 'approved' });
//             if (affiliate) {
//                 buyerDiscountAmount = Math.round(totalAmount * 0.10);
//                 affiliateId = affiliate._id;
//             }
//         }

//         const finalAmount = totalAmount - discountAmount - buyerDiscountAmount;

//         // 🔢 Order meta
//         const latestOrder = await Order.findOne().sort({ createdAt: -1 });
//         const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
//         const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
//         const customOrderId = `CUSTOM-${Date.now()}`;

//         // ✅ Save order
//         const newOrder = new Order({
//             products: productsForOrder,
//             orderId,
//             orderNumber: nextOrderNumber,
//             customOrderId,
//             user: user._id,
//             customerName: user.name,
//             date: new Date(),
//             status: "Pending",
//             orderType: "Online",
//             amount: finalAmount,
//             discount: req.discount?._id || null,
//             discountCode,
//             discountAmount,
//             buyerDiscountAmount,
//             affiliate: affiliateId,
//             paid: false,
//             paymentStatus: "pending",
//         });

//         await newOrder.save();

//         res.status(200).json({
//             message: "✅ Order initiated",
//             orderId: newOrder._id,
//             displayOrderId: newOrder.orderId,
//             totalAmount,
//             discountAmount,
//             buyerDiscountAmount,
//             finalAmount,
//         });
//     } catch (err) {
//         console.error("🔥 Error initiating order:", err);
//         return res.status(500).json({ message: "Failed to initiate order", error: err.message });
//     }
// };



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




// export const initiateOrderFromCart = async (req, res) => {
//     try {
//         if (!req.user || !req.user._id) return res.status(401).json({ message: 'Unauthorized' });

//         const user = await User.findById(req.user._id).populate('cart.product');
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         const validCartItems = (user.cart || []).filter(i => i.product);
//         if (!validCartItems.length) return res.status(400).json({ message: 'Cart is empty' });

//         // Build cart lines for order & discount helper
//         const cartForDiscount = validCartItems.map(i => ({ productId: String(i.product._id), qty: i.quantity }));

//         // Reserve discount (this increments usageCount atomically)
//         let discountAmount = 0;
//         let discountCode = null;
//         let discountId = null;
//         if (req.body.discountCode) {
//             try {
//                 const { success, discount, priced } = await reserveDiscountUsage({
//                     code: req.body.discountCode.trim(),
//                     userId: req.user._id,
//                     cart: cartForDiscount
//                 });
//                 if (success) {
//                     discountAmount = priced.discountAmount;
//                     discountCode = discount.code;
//                     discountId = discount._id;
//                 }
//             } catch (err) {
//                 // When reservation fails, return 400 (caller should show error to user)
//                 return res.status(400).json({ message: err.message });
//             }
//         }

//         // Recompute totals server-side (trusted)
//         const products = validCartItems.map(i => i.product);
//         const totalAmount = validCartItems.reduce((s, it) => s + (it.product.price * it.quantity), 0);

//         // Affiliate/referral
//         let buyerDiscountAmount = 0;
//         let affiliateId = null;
//         if (req.query.ref) {
//             const affiliate = await Affiliate.findOne({ referralCode: req.query.ref, status: 'approved' });
//             if (affiliate) {
//                 buyerDiscountAmount = Math.round(totalAmount * 0.1);
//                 affiliateId = affiliate._id;
//             }
//         }

//         const finalAmount = Math.max(0, totalAmount - discountAmount - buyerDiscountAmount);

//         // Save order
//         const latestOrder = await Order.findOne().sort({ createdAt: -1 });
//         const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
//         const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
//         const newOrder = new Order({
//             products: validCartItems.map(i => ({ productId: i.product._id, quantity: i.quantity, price: i.product.price })),
//             orderId,
//             orderNumber: nextOrderNumber,
//             user: user._id,
//             customerName: user.name,
//             date: new Date(),
//             status: 'Pending',
//             orderType: 'Online',
//             amount: finalAmount,
//             discount: discountId || null,
//             discountCode: discountCode || null,
//             discountAmount,
//             buyerDiscountAmount,
//             affiliate: affiliateId || null,
//             paid: false,
//             paymentStatus: 'pending'
//         });

//         await newOrder.save();

//         return res.status(200).json({
//             message: '✅ Order initiated',
//             orderId: newOrder._id,
//             displayOrderId: newOrder.orderId,
//             totalAmount,
//             discountAmount,
//             buyerDiscountAmount,
//             finalAmount,
//             appliedDiscount: discountCode || null,
//             savingsBreakdown: {
//                 fromCoupon: discountAmount,
//                 fromReferral: buyerDiscountAmount,
//                 totalSavings: discountAmount + buyerDiscountAmount
//             }
//         });
//     } catch (err) {
//         console.error('initiateOrderFromCart error:', err);
//         return res.status(500).json({ message: 'Failed to initiate order', error: err.message });
//     }
// };

// export const initiateOrderFromCart = async (req, res) => {
//     try {
//         if (!req.user || !req.user._id) {
//             return res.status(401).json({ message: 'Unauthorized' });
//         }

//         const user = await User.findById(req.user._id).populate('cart.product');
//         if (!user) return res.status(404).json({ message: 'User not found' });

//         const validCartItems = (user.cart || []).filter(item => item.product);
//         if (!validCartItems.length) {
//             return res.status(400).json({ message: 'Cart is empty' });
//         }

//         // Build cart items for response & subtotal
//         const cartItems = validCartItems.map(item => {
//             const product = item.product;
//             const displayImage =
//                 product.image ||
//                 (Array.isArray(product.images) && product.images.length ? product.images[0] : null);

//             return {
//                 productId: product._id,
//                 name: product.name,
//                 image: displayImage,
//                 quantity: item.quantity,
//                 price: product.price,
//                 subTotal: product.price * item.quantity
//             };
//         });

//         // ✅ Use cartItems directly for subtotal
//         const subtotal = cartItems.reduce((acc, item) => acc + item.subTotal, 0);

//         // Reserve discount
//         let discountAmount = 0;
//         let discountCode = null;
//         let discountId = null;
//         const discountCodeInput = req.body.discountCode || req.query.discount;
//         if (discountCodeInput) {
//             try {
//                 const { success, discount, priced } = await reserveDiscountUsage({
//                     code: discountCodeInput.trim(),
//                     userId: req.user._id,
//                     cart: cartItems.map(i => ({ productId: i.productId, qty: i.quantity }))
//                 });
//                 if (success) {
//                     discountAmount = priced.discountAmount;
//                     discountCode = discount.code;
//                     discountId = discount._id;
//                 }
//             } catch (err) {
//                 return res.status(400).json({ message: err.message });
//             }
//         }

//         // Affiliate/referral
//         let buyerDiscountAmount = 0;
//         let affiliateId = null;
//         if (req.query.ref) {
//             const affiliate = await Affiliate.findOne({
//                 referralCode: req.query.ref,
//                 status: 'approved'
//             });
//             if (affiliate) {
//                 buyerDiscountAmount = Math.round(subtotal * 0.1);
//                 affiliateId = affiliate._id;
//             }
//         }

//         const finalAmount = Math.max(0, subtotal - discountAmount - buyerDiscountAmount);

//         // Generate order numbers
//         const latestOrder = await Order.findOne().sort({ createdAt: -1 });
//         const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
//         const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

//         // Save order
//         const newOrder = new Order({
//             products: cartItems.map(item => ({
//                 productId: item.productId,
//                 quantity: item.quantity,
//                 price: item.price
//             })),
//             orderId,
//             orderNumber: nextOrderNumber,
//             user: user._id,
//             customerName: user.name,
//             date: new Date(),
//             status: 'Pending',
//             orderType: 'Online',
//             amount: finalAmount,
//             discount: discountId || null,
//             discountCode: discountCode || null,
//             discountAmount,
//             buyerDiscountAmount,
//             affiliate: affiliateId || null,
//             paid: false,
//             paymentStatus: 'pending'
//         });

//         await newOrder.save();

//         return res.status(200).json({
//             message: '✅ Order initiated',
//             orderId: newOrder._id,
//             displayOrderId: newOrder.orderId,
//             cart: cartItems, // ✅ consistent with getCartSummary
//             subtotal,
//             discountAmount,
//             buyerDiscountAmount,
//             finalAmount,
//             appliedDiscount: discountCode || null,
//             savingsBreakdown: {
//                 fromCoupon: discountAmount,
//                 fromReferral: buyerDiscountAmount,
//                 totalSavings: discountAmount + buyerDiscountAmount
//             }
//         });
//     } catch (err) {
//         console.error('initiateOrderFromCart error:', err);
//         return res
//             .status(500)
//             .json({ message: 'Failed to initiate order', error: err.message });
//     }
// };


export const initiateOrderFromCart = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });

    const validCartItems = (user.cart || []).filter((item) => item.product);
    if (!validCartItems.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Build cart items
    const cartItems = validCartItems.map((item) => {
      const product = item.product;
      const displayImage =
        product.image ||
        (Array.isArray(product.images) && product.images.length
          ? product.images[0]
          : null);

      return {
        productId: product._id,
        name: product.name,
        image: displayImage,
        quantity: item.quantity,
        price: product.price,
        subTotal: product.price * item.quantity,
      };
    });

    // ✅ Subtotal
    const subtotal = cartItems.reduce((acc, item) => acc + item.subTotal, 0);

    /* -------------------- 🔥 Apply Promotions -------------------- */
    const itemsInput = validCartItems.map((i) => ({
      productId: String(i.product._id),
      qty: i.quantity,
    }));

    const promoResult = await applyPromotions(itemsInput, {
      userContext: { isNewUser: user.isNewUser },
    });

    const { items, summary } = promoResult;

    // ✅ Base payable after auto-promotions
    let payable = summary.payable;

    /* -------------------- 🎟️ Coupon Discount -------------------- */
    let discountAmount = 0;
    let discountCode = null;
    let discountId = null;
    const discountCodeInput = req.body.discountCode || req.query.discount;

    if (discountCodeInput) {
      try {
        const { success, discount, priced } = await reserveDiscountUsage({
          code: discountCodeInput.trim(),
          userId: req.user._id,
          cart: itemsInput,
        });
        if (success) {
          const COUPON_MAX_CAP = discount.maxCap || 500;
          discountAmount = Math.min(priced.discountAmount, COUPON_MAX_CAP);
          discountCode = discount.code;
          discountId = discount._id;
          payable -= discountAmount;
        }
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    /* -------------------- 💰 Referral Points -------------------- */
    let pointsUsed = 0;
    let pointsDiscount = 0;
    const wallet = await getOrCreateWallet(req.user._id);

    if (req.query.pointsToUse) {
      pointsUsed = Number(req.query.pointsToUse);
      if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
        if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;
        pointsDiscount = pointsUsed * 0.1;
        payable -= pointsDiscount;
      }
    }

    /* -------------------- 🎁 Gift Card -------------------- */
    let giftCardDiscount = 0;
    let giftCardCode = null;

    if (req.query.giftCardCode && req.query.giftCardPin) {
      const giftCard = await GiftCard.findOne({
        code: req.query.giftCardCode.trim(),
        pin: req.query.giftCardPin.trim(),
      });

      if (giftCard && giftCard.balance > 0 && giftCard.expiryDate > new Date()) {
        const amountRequested = Number(req.query.giftCardAmount);
        if (amountRequested > 0 && amountRequested <= giftCard.balance) {
          const payableBeforeGC = Math.max(0, payable);
          if (amountRequested <= payableBeforeGC) {
            giftCardDiscount = amountRequested;
            giftCardCode = giftCard.code;
            payable -= giftCardDiscount;
          }
        }
      }
    }

    // ✅ Final grand total
    const grandTotal = Math.max(0, Math.round(payable * 100) / 100);

    // Generate order numbers
    const latestOrder = await Order.findOne().sort({ createdAt: -1 });
    const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // ✅ Save order with FINAL payable (same as checkout)
    const newOrder = new Order({
      products: cartItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
      orderId,
      orderNumber: nextOrderNumber,
      user: user._id,
      customerName: user.name,
      date: new Date(),
      status: "Pending",
      orderType: "Online",
      amount: grandTotal,
      subtotal,
      discount: discountId || null,
      discountCode: discountCode || null,
      discountAmount,
      pointsUsed,
      pointsDiscount,
      giftCardCode,
      giftCardDiscount,
      paid: false,
      paymentStatus: "pending",
    });

    await newOrder.save();

    return res.status(200).json({
      message: "✅ Order initiated",
      orderId: newOrder._id,
      displayOrderId: newOrder.orderId,
      cart: cartItems,
      subtotal,
      discountAmount,
      pointsDiscount,
      giftCardDiscount,
      finalAmount: grandTotal,
      appliedDiscount: discountCode || null,
      savingsBreakdown: {
        fromCoupon: discountAmount,
        fromPoints: pointsDiscount,
        fromGiftCard: giftCardDiscount,
        totalSavings: discountAmount + pointsDiscount + giftCardDiscount,
      },
    });
  } catch (err) {
    console.error("initiateOrderFromCart error:", err);
    return res
      .status(500)
      .json({ message: "Failed to initiate order", error: err.message });
  }
};



export const getOrderTracking = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId upfront
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }

        const order = await Order.findById(id).populate("products.productId");
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        let liveTracking = null;

        // ✅ Fetch Shiprocket tracking only if AWB exists
        if (order.shipment?.awb_code) {
            try {
                const token = await getShiprocketToken();
                const trackRes = await axios.get(
                    `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
                    { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 } // ⏱ 10s safety timeout
                );
                liveTracking = trackRes.data;
            } catch (err) {
                console.error("❌ Shiprocket tracking fetch failed:", err.response?.data || err.message);
                // Still send response gracefully
                liveTracking = { tracking_data: { shipment_status: "Tracking Unavailable" } };
            }
        }

        // ✅ Always return something
        return res.json({
            orderId: order._id,
            status: order.orderStatus,
            shipment: {
                shipment_id: order.shipment?.shipment_id || null,
                awb_code: order.shipment?.awb_code || null,
                tracking_url: order.shipment?.tracking_url || null,
                courier_id: order.shipment?.courier_id || null,
                courier_name:
                    liveTracking?.tracking_data?.courier_name || order.shipment?.courier_name || null,
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
        console.error("🔥 getOrderTracking failed:", err.message);
        return res.status(500).json({
            message: "Failed to fetch order tracking",
            error: err.message,
        });
    }
};




// 🚀 Test Shiprocket Integration
export const testShiprocket = async (req, res) => {
    try {
        const { id, orderId } = req.body; // accept both _id and orderId

        let order = null;

        if (id && mongoose.Types.ObjectId.isValid(id)) {
            order = await Order.findById(id).populate("products.productId user");
        }

        if (!order && orderId) {
            order = await Order.findOne({ orderId }).populate("products.productId user");
        }
        if (!order) {
            return res.status(404).json({
                error: "Order not found",
                tried: { id, orderId }
            });
        }

        const shipment = await createShiprocketOrder(order);
        return res.json(shipment);

    } catch (err) {
        console.error("❌ Shiprocket Test Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
};