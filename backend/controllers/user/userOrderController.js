import express from "express";
import mongoose from "mongoose";
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import { calculateCartSummary } from "../../middlewares/utils/cartPricingHelper.js";
import axios from "axios";
import { getShiprocketToken, createShiprocketOrder } from "../../middlewares/services/shiprocket.js"; // helper to fetch token
import { getCartSummary } from "../../controllers/user/userCartController.js";
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
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.cart || !user.cart.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // -------------------- 🔥 Calculate cart summary --------------------
    const summaryData = await calculateCartSummary(user, {
      discount: req.body?.discountCode || req.query?.discount,        // optional
      pointsToUse: req.body?.pointsToUse || req.query?.pointsToUse,  // optional
      giftCardCode: req.body?.giftCardCode || req.query?.giftCardCode,    // optional
      giftCardPin: req.body?.giftCardPin || req.query?.giftCardPin,        // optional
      giftCardAmount: req.body?.giftCardAmount || req.query?.giftCardAmount // optional
    });


    const {
      cart,
      priceDetails,
      appliedCoupon,
      pointsUsed,
      pointsDiscount,
      giftCardApplied,
      grandTotal,
    } = summaryData;

    if (!cart || !cart.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // -------------------- 📝 Generate order identifiers --------------------
    const latestOrder = await Order.findOne().sort({ createdAt: -1 });
    const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    // -------------------- 💾 Save new order --------------------
    const newOrder = new Order({
      products: cart.map((item) => ({
        productId: item.product, // product _id
        quantity: item.quantity, // quantity
        price: item.variant?.discountedPrice || item.variant?.originalPrice || 0, // variant price
        selectedVariant: item.variant || null, // keep variant details
      })),
      orderId,
      orderNumber: nextOrderNumber,
      user: user._id,
      customerName: user.name,
      date: new Date(),
      status: "Pending",
      orderType: "Online",
      amount: grandTotal,
      subtotal: priceDetails.bagMrp,
      totalSavings:
        priceDetails.bagDiscount +
        priceDetails.couponDiscount +
        priceDetails.referralPointsDiscount +
        priceDetails.giftCardDiscount,
      couponDiscount: priceDetails.couponDiscount,
      pointsDiscount: priceDetails.referralPointsDiscount,
      giftCardDiscount: priceDetails.giftCardDiscount,
      discountCode: appliedCoupon?.code || null,
      paid: false,
      paymentStatus: "pending",
    });


    await newOrder.save();

    // -------------------- 📤 Send response --------------------
    return res.status(200).json({
      message: "✅ Order initiated",
      orderId: newOrder._id,
      displayOrderId: newOrder.orderId,
      finalAmount: grandTotal,
      priceBreakdown: priceDetails,
      cart,
      appliedCoupon,
      pointsUsed,
      pointsDiscount,
      giftCardApplied,
    });
  } catch (err) {
    console.error("initiateOrderFromCart error:", err);
    return res.status(500).json({
      message: "Failed to initiate order",
      error: err.message,
    });
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