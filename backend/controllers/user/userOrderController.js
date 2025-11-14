import express from "express";
import mongoose from "mongoose";
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import { calculateCartSummary } from "../../middlewares/utils/cartPricingHelper.js";
import axios from "axios";
import { getShiprocketToken, createShiprocketOrder } from "../../middlewares/services/shiprocket.js"; // helper to fetch token


// 🔄 Convert Shiprocket numeric status → human readable
const shiprocketStatusMap = {
  0: "Not Picked",
  1: "Pickup Scheduled",
  2: "Pickup Error",
  3: "Picked Up",
  4: "In Transit",
  5: "Out For Delivery",
  6: "Delivered",
  7: "Cancelled",
  8: "RTO Initiated",
  9: "RTO In Transit",
  10: "RTO Delivered"
};


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

// export const getUserOrders = async (req, res) => {
//   try {
//     // ✅ Fetch all user orders sorted by latest first
//     const orders = await Order.find({
//       user: req.user._id,
//       isDraft: false    // ✅ hide draft orders
//     })
//       .populate({
//         path: "products.productId",
//         select: "name images brand category variants",
//       })
//       .sort({ createdAt: -1 })
//       .lean();

//     if (!orders.length) {
//       return res.status(200).json({
//         success: true,
//         message: "You haven’t placed any orders yet.",
//         orders: [],
//       });
//     }

//     // ✅ Remove duplicate orders by orderId, keep the latest
//     const uniqueOrdersMap = new Map();
//     orders.forEach(order => {
//       // If no entry exists, or current order is newer, set it
//       if (!uniqueOrdersMap.has(order.orderId)) {
//         uniqueOrdersMap.set(order.orderId, order);
//       }
//     });
//     const uniqueOrders = Array.from(uniqueOrdersMap.values());

//     // ✅ Format final clean response
//     const cleanedOrders = uniqueOrders.map(order => {
//       const shipmentStatus = order.shipment?.status || order.shipmentStatus || "Created";
//       const combinedStatus = shipmentStatus || order.status;

//       return {
//         _id: order._id,
//         orderId: order.orderId,
//         orderNumber: order.orderNumber,
//         date: order.date,
//         status: order.status || "Pending",
//         shipmentStatus,
//         combinedStatus,
//         amount: order.amount,
//         discountAmount: order.discountAmount || 0,
//         discountCode: order.discountCode || null,
//         buyerDiscountAmount: order.buyerDiscountAmount || 0,

//         shippingAddress: order.shippingAddress
//           ? {
//             name: order.shippingAddress.name,
//             email: order.shippingAddress.email,
//             phone: order.shippingAddress.phone,
//             pincode: order.shippingAddress.pincode,
//             city: order.shippingAddress.city,
//             state: order.shippingAddress.state,
//             addressLine1: order.shippingAddress.addressLine1,
//           }
//           : null,

//         products: (order.products || []).map(item => ({
//           productId: item.productId?._id,
//           name: item.productId?.name || item.name || "Unknown Product",
//           variant:
//             item.variant ||
//             item.productId?.variants?.find(v => v._id === item.variantId)?.shadeName ||
//             null,
//           brand: item.productId?.brand || null,
//           category: item.productId?.category || null,
//           image:
//             item.productId?.images?.[0] ||
//             item.image ||
//             "https://cdn-icons-png.flaticon.com/512/679/679922.png",
//           quantity: item.quantity || 1,
//           price: item.price,
//           total: item.quantity * item.price,
//         })),

//         payment: {
//           method: order.paymentMethod || "Manual",
//           status: order.paymentStatus || "pending",
//           transactionId: order.transactionId || null,
//         },

//         expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
//           .toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
//       };
//     });

//     // ✅ Final response
//     res.status(200).json({
//       success: true,
//       message: `Found ${cleanedOrders.length} order${cleanedOrders.length > 1 ? "s" : ""}.`,
//       orders: cleanedOrders,
//     });
//   } catch (err) {
//     console.error("🔥 Error fetching user orders:", err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch your orders. Please try again later.",
//     });
//   }
// };
export const getUserOrders = async (req, res) => {
  try {
    // ✅ Fetch all user orders sorted by latest first
    const orders = await Order.find({
      user: req.user._id,
      isDraft: false // ✅ hide draft orders
    })
      .populate({
        path: "products.productId",
        select: "name images brand category variants",
      })
      .sort({ createdAt: -1 })
      .lean();

    if (!orders.length) {
      return res.status(200).json({
        success: true,
        message: "You haven’t placed any orders yet.",
        orders: [],
      });
    }

    // ✅ Remove duplicate orders by orderId, keep the latest
    const uniqueOrdersMap = new Map();
    orders.forEach(order => {
      if (!uniqueOrdersMap.has(order.orderId)) {
        uniqueOrdersMap.set(order.orderId, order);
      }
    });
    const uniqueOrders = Array.from(uniqueOrdersMap.values());

    // ✅ Format final clean response
    const cleanedOrders = uniqueOrders.map(order => {
      // 🧠 Dynamic smart status logic
      let dynamicStatus = order.orderStatus || order.status || "Pending";

      // 👉 If refund process started or failed/completed
      if (order.paymentStatus?.startsWith("refund")) {
        dynamicStatus =
          "Refund " +
          order.paymentStatus
            .replace("refund_", "")
            .replace("_", " ")
            .replace(/\b\w/g, c => c.toUpperCase());
      }

      // 👉 If order was cancelled
      if (
        order.cancellation?.reason &&
        (order.orderStatus === "Cancelled" || order.status === "Cancelled")
      ) {
        dynamicStatus = "Cancelled";
      }

      const shipmentStatus = order.shipment?.status || "Created";
      const combinedStatus =
        shipmentStatus !== "Created" ? shipmentStatus : dynamicStatus;

      return {
        _id: order._id,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        date: order.date,
        status: dynamicStatus,
        shipmentStatus,
        combinedStatus,
        amount: order.amount,
        discountAmount: order.discountAmount || 0,
        discountCode: order.discountCode || null,
        buyerDiscountAmount: order.buyerDiscountAmount || 0,

        shippingAddress: order.shippingAddress
          ? {
            name: order.shippingAddress.name,
            email: order.shippingAddress.email,
            phone: order.shippingAddress.phone,
            pincode: order.shippingAddress.pincode,
            city: order.shippingAddress.city,
            state: order.shippingAddress.state,
            addressLine1: order.shippingAddress.addressLine1,
          }
          : null,

        products: (order.products || []).map(item => ({
          productId: item.productId?._id,
          name: item.productId?.name || item.name || "Unknown Product",
          variant:
            item.variant ||
            item.productId?.variants?.find(v => v._id === item.variantId)
              ?.shadeName ||
            null,
          brand: item.productId?.brand || null,
          category: item.productId?.category || null,
          image:
            item.productId?.images?.[0] ||
            item.image ||
            "https://cdn-icons-png.flaticon.com/512/679/679922.png",
          quantity: item.quantity || 1,
          price: item.price,
          total: item.quantity * item.price,
        })),

        payment: {
          method: order.paymentMethod || "Manual",
          status: order.paymentStatus || "pending",
          transactionId: order.transactionId || null,
        },
        // ✅ add this section
        shipment: order.shipment
          ? {
            courier: order.shipment.courier_name || null,
            awb_code: order.shipment.awb_code || null,
            tracking_url: order.shipment.tracking_url || null,
            status: order.shipment.status || null,
          }
          : null,

        expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(
          "en-IN",
          {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          }
        ),
      };
    });

    // ✅ Final response
    res.status(200).json({
      success: true,
      message: `Found ${cleanedOrders.length} order${cleanedOrders.length > 1 ? "s" : ""
        }.`,
      orders: cleanedOrders,
    });
  } catch (err) {
    console.error("🔥 Error fetching user orders:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your orders. Please try again later.",
    });
  }
};

export const initiateOrderFromCart = async (req, res) => {
  try {
    // ✅ Authentication check
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ Fetch user + cart
    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.cart?.length)
      return res.status(400).json({ message: "Cart is empty" });

    // ✅ Recalculate latest cart summary
    const summaryData = await calculateCartSummary(user, {
      discount: req.body?.discountCode || req.query?.discount,
      pointsToUse: req.body?.pointsToUse || req.query?.pointsToUse,
      giftCardCode: req.body?.giftCardCode || req.query?.giftCardCode,
      giftCardPin: req.body?.giftCardPin || req.query?.giftCardPin,
      giftCardAmount: req.body?.giftCardAmount || req.query?.giftCardAmount,
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

    if (!cart?.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // ✅ Fetch products referenced in cart
    const productIds = cart.map((i) => i.product);
    const products = await Product.find({ _id: { $in: productIds } }).lean();

    // ✅ Generate unique order IDs
    const latestOrder = await Order.findOne().sort({ createdAt: -1 });
    const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // ✅ Finalize cart item structure
    const finalCart = cart.map((item) => {
      const product = products.find(
        (p) => p._id.toString() === item.product.toString()
      );
      if (!product) throw { userFriendly: true, message: `Product not found: ${item.product}` };

      let dbVariant =
        product.variants.find(
          (v) =>
            String(v.sku).trim().toLowerCase() ===
            String(item.variant?.sku).trim().toLowerCase()
        ) ||
        product.variants.find(
          (v) =>
            String(v.shadeName).trim().toLowerCase() ===
            String(item.variant?.shadeName).trim().toLowerCase()
        ) ||
        product.variants.find(
          (v) => v._id?.toString() === item.variant?._id?.toString()
        ) ||
        product.variants?.[0];

      if (!dbVariant) {
        throw { userFriendly: true, message: `Variant not found for product: ${product.name}` };
      }

      // ✅ Stock validation (no stack trace)
      const requestedQty = item.quantity || 1;
      if (typeof dbVariant.stock !== "number" || dbVariant.stock <= 0) {
        throw {
          userFriendly: true,
          message: `🛒 We’re sorry, but ${product.name} (${dbVariant.shadeName || dbVariant.sku}) is currently unavailable. Please remove this item from your cart to proceed with your order.`,
        };
      }

      if (dbVariant.stock < requestedQty) {
        throw {
          userFriendly: true,
          message: `🛒 Only ${dbVariant.stock} unit${dbVariant.stock > 1 ? "s" : ""} of ${product.name} (${dbVariant.shadeName || dbVariant.sku}) are available. Please adjust the quantity or remove this item from your cart to continue with your order.`,
        };
      }

      const finalPrice =
        item.variant?.discountedPrice ??
        item.variant?.displayPrice ??
        dbVariant.discountedPrice ??
        dbVariant.displayPrice ??
        product.price ??
        0;

      const variantSnapshot = {
        sku: dbVariant.sku || item.variant?.sku || null,
        shadeName: dbVariant.shadeName || item.variant?.shadeName || null,
        hex: dbVariant.hex || item.variant?.hex || null,
        images:
          dbVariant.images?.length
            ? dbVariant.images
            : item.variant?.images?.length
              ? item.variant.images
              : product.images || [],
        image:
          dbVariant.images?.[0] ||
          item.variant?.image ||
          product.images?.[0] ||
          null,
        stock: typeof dbVariant.stock === "number" ? dbVariant.stock : 0,
        originalPrice:
          item.variant?.originalPrice ??
          dbVariant.originalPrice ??
          product.price ??
          0,
        discountedPrice: finalPrice,
        displayPrice: finalPrice,
        discountPercent:
          item.variant?.discountPercent ??
          (dbVariant.originalPrice && dbVariant.discountedPrice
            ? Math.round(
              ((dbVariant.originalPrice - dbVariant.discountedPrice) /
                dbVariant.originalPrice) *
              100
            )
            : 0),
        discountAmount:
          item.variant?.discountAmount ??
          (dbVariant.originalPrice && dbVariant.discountedPrice
            ? dbVariant.originalPrice - dbVariant.discountedPrice
            : 0),
      };

      const productSnapshot = {
        id: product._id,
        name: product.name,
        brand: product.brand,
        category: product.category,
      };

      return {
        productId: String(product._id),
        productSnapshot,
        name: product.name,
        quantity: item.quantity || 1,
        price: finalPrice,
        variant: variantSnapshot,
      };
    });

    // ✅ Create and save new order
    const newOrder = new Order({
      products: finalCart,
      orderId,
      orderNumber: nextOrderNumber,
      user: user._id,
      customerName: user.name,
      date: new Date(),
      status: "Pending",
      orderType: null, // ✅ will be updated later
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
      isDraft: true, // ✅ this is new
    });

    await newOrder.save();

    return res.status(200).json({
      message: "✅ Order initiated",
      orderId: newOrder._id,
      displayOrderId: newOrder.orderId,
      nextStep: "SELECT_PAYMENT_METHOD",
      finalAmount: grandTotal,
      priceBreakdown: priceDetails,
      cart: finalCart,
      appliedCoupon,
      pointsUsed,
      pointsDiscount,
      giftCardApplied,
    });
  } catch (err) {
    // ✅ Friendly error logging
    if (err.userFriendly) {
      console.log("🟡 User message:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }

    // ✅ Prevent double response
    if (res.headersSent) return;

    console.error("❌ initiateOrderFromCart error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate order. Please try again.",
    });
  }
};

export const getOrderTracking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id).populate("products.productId");
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Timeline sorted + deduplicated
    const timeline = [];

    (order.trackingHistory || [])
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .forEach(entry => {
        const cleanStatus = shiprocketStatusMap[entry.status] || entry.status;
        const last = timeline[timeline.length - 1];

        if (!last || last.status !== cleanStatus) {
          timeline.push({
            status: cleanStatus,
            timestamp: entry.timestamp,
            location: entry.location || null
          });
        }
      });

    // --- Live Shiprocket tracking (optional) ---
    let liveTracking = null;
    if (order.shipment?.awb_code) {
      try {
        const token = await getShiprocketToken();
        const trackRes = await axios.get(
          `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        liveTracking = trackRes.data;
      } catch (err) {
        console.error("❌ Shiprocket tracking fetch failed:", err.response?.data || err.message);
        liveTracking = { tracking_data: { shipment_status: "Tracking Unavailable" } };
      }
    }

    // Convert live numeric status to readable text
    const rawLiveStatus = liveTracking?.tracking_data?.shipment_status;
    const mappedLiveStatus =
      shiprocketStatusMap[rawLiveStatus] ||
      rawLiveStatus ||
      order.shipment?.status ||
      "Created";

    res.json({
      _id: order._id, // ✅ MongoDB ObjectId
      orderId: order.orderId,
      status: order.orderStatus || order.status,
      shipment: {
        shipment_id: order.shipment?.shipment_id || null,
        awb_code: order.shipment?.awb_code || null,
        courier_id: order.shipment?.courier_id || null,
        courier_name: liveTracking?.tracking_data?.courier_name || order.shipment?.courier_name || null,
        current_status: mappedLiveStatus,
        tracking_url: order.shipment?.tracking_url || null,
      },
      products: order.products.map((item) => ({
        productId: item.productId?._id,
        name: item.productId?.name,
        variant: item.productId?.variant || null,
        price: item.price,
        quantity: item.quantity,
        image: item.productId?.images?.[0] || null,
        brand: item.productId?.brand || null,
      })),
      amount: order.amount,
      payment: {
        transactionId: order.transactionId,
        method: order.paymentMethod,
        status: order.paymentStatus,
      },
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt,
      timeline, // ✅ include all previous steps
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