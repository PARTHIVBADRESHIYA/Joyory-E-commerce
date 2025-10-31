import express from "express";
import mongoose from "mongoose";
import Product from '../../models/Product.js';
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

// export const getUserOrders = async (req, res) => {
//   try {
//     const orders = await Order.find({ user: req.user._id })
//       .populate("products.productId")
//       .sort({ createdAt: -1 });

//     const cleanedOrders = orders.map(order => {
//       const shipmentStatus = mapShipmentStatus(order.shipment?.status);
//       const combinedStatus = shipmentStatus || order.status;
//       const statusLabel = shipmentStatus || order.status;

//       return {
//         orderId: order.orderId,
//         orderNumber: order.orderNumber,
//         date: order.date,
//         status: order.status, // raw DB status
//         shipmentStatus, // normalized
//         combinedStatus,
//         statusLabel,
//         amount: order.amount,
//         discountAmount: order.discountAmount || 0,
//         discountCode: order.discountCode || null,
//         buyerDiscountAmount: order.buyerDiscountAmount || 0,
//         shippingAddress: order.shippingAddress || null,
//         products: order.products.map(item => {
//           const product = item.productId;
//           return {
//             productId: product?._id,
//             name: product?.name || "Unknown Product",
//             variant: product?.variant || null,
//             brand: product?.brand || null,
//             category: product?.category || null,
//             image: product?.images?.[0] || null,
//             quantity: item.quantity,
//             price: item.price,
//             total: item.quantity * item.price,
//           };
//         }),
//         payment: {
//           method: order.paymentMethod || "Manual",
//           status: order.paymentStatus || "pending",
//           transactionId: order.transactionId || null,
//         },
//         expectedDelivery:
//           order.expectedDelivery ||
//           new Date(order.date.getTime() + 5 * 24 * 60 * 60 * 1000), // +5 days fallback
//         shipment: order.shipment
//           ? {
//             shipment_id: order.shipment.shipment_id,
//             awb_code: order.shipment.awb_code,
//             courier: order.shipment.courier,
//             status: shipmentStatus,
//             tracking_url: order.shipment.tracking_url || null,
//             track_now: order.shipment.tracking_url || null,
//           }
//           : null,
//       };
//     });

//     res.status(200).json({ orders: cleanedOrders });
//   } catch (err) {
//     console.error("🔥 Error fetching user orders:", err);
//     res.status(500).json({ message: "Failed to fetch orders" });
//   }
// };
export const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate("products.productId")
      .sort({ createdAt: -1 });

    const cleanedOrders = orders.map(order => {
      // Combine shipment status with order status
      const shipmentStatus = order.shipment?.status || null;
      const combinedStatus = shipmentStatus || order.orderStatus || order.status;

      return {
        _id: order._id, // ✅ MongoDB ObjectId
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        date: order.date,
        status: order.status,
        shipmentStatus,
        combinedStatus,
        amount: order.amount,
        discountAmount: order.discountAmount || 0,
        discountCode: order.discountCode || null,
        buyerDiscountAmount: order.buyerDiscountAmount || 0,
        shippingAddress: order.shippingAddress || null,
        products: order.products.map(item => ({
          productId: item.productId?._id,
          name: item.productId?.name || "Unknown Product",
          variant: item.productId?.variant || null,
          brand: item.productId?.brand || null,
          category: item.productId?.category || null,
          image: item.productId?.images?.[0] || null,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price,
        })),
        payment: {
          method: order.paymentMethod || "Manual",
          status: order.paymentStatus || "pending",
          transactionId: order.transactionId || null,
        },
        expectedDelivery:
          order.expectedDelivery ||
          new Date(order.date.getTime() + 5 * 24 * 60 * 60 * 1000),
      };
    });

    res.status(200).json({ orders: cleanedOrders });
  } catch (err) {
    console.error("🔥 Error fetching user orders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// export const initiateOrderFromCart = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });
//     if (!user.cart?.length)
//       return res.status(400).json({ message: "Cart is empty" });

//     // -------------------- 🧮 Calculate Summary --------------------
//     const summaryData = await calculateCartSummary(user, {
//       discount: req.body?.discountCode || req.query?.discount,
//       pointsToUse: req.body?.pointsToUse || req.query?.pointsToUse,
//       giftCardCode: req.body?.giftCardCode || req.query?.giftCardCode,
//       giftCardPin: req.body?.giftCardPin || req.query?.giftCardPin,
//       giftCardAmount: req.body?.giftCardAmount || req.query?.giftCardAmount,
//     });

//     const {
//       cart,
//       priceDetails,
//       appliedCoupon,
//       pointsUsed,
//       pointsDiscount,
//       giftCardApplied,
//       grandTotal,
//     } = summaryData;

//     if (!cart?.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     // -------------------- 🛍 Fetch DB Products --------------------
//     const productIds = cart.map((i) => i.product);
//     const products = await Product.find({ _id: { $in: productIds } }).lean();

//     // -------------------- 🧾 Generate Order ID --------------------
//     const latestOrder = await Order.findOne().sort({ createdAt: -1 });
//     const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
//     const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

//     // -------------------- 🧩 Build Cart Snapshot --------------------
//     const finalCart = cart.map((item) => {
//       const product = products.find(
//         (p) => p._id.toString() === item.product.toString()
//       );
//       if (!product) throw new Error(`Product not found: ${item.product}`);

//       // Verify variant exists
//       let dbVariant = null;
//       if (item.variant?.sku) {
//         dbVariant = product.variants.find(
//           (v) => v.sku?.trim() === item.variant.sku?.trim()
//         );
//       }
//       if (!dbVariant && item.variant?._id) {
//         dbVariant = product.variants.find(
//           (v) => v._id?.toString() === item.variant._id?.toString()
//         );
//       }
//       if (!dbVariant)
//         throw new Error(`Variant not found for product: ${product.name}`);

//       // ✅ Use already-calculated variant prices from summary
//       const variantSnapshot = {
//         sku: item.variant?.sku || dbVariant.sku || null,
//         shadeName: item.variant?.shadeName || dbVariant.shadeName || null,
//         hex: item.variant?.hex || dbVariant.hex || null,
//         images:
//           item.variant?.images?.length
//             ? item.variant.images
//             : dbVariant.images?.length
//             ? dbVariant.images
//             : product.images || [],
//         image:
//           item.variant?.image ||
//           dbVariant.image ||
//           dbVariant.images?.[0] ||
//           product.images?.[0] ||
//           null,
//         stock: typeof dbVariant.stock === "number" ? dbVariant.stock : 0,

//         // ✅ These come from the calculated cart summary (not DB)
//         originalPrice: item.variant?.originalPrice ?? dbVariant.originalPrice ?? 0,
//         discountedPrice:
//           item.variant?.discountedPrice ??
//           item.variant?.displayPrice ??
//           dbVariant.discountedPrice ??
//           0,
//         displayPrice:
//           item.variant?.displayPrice ??
//           item.variant?.discountedPrice ??
//           dbVariant.displayPrice ??
//           0,
//         discountPercent:
//           item.variant?.discountPercent ??
//           (item.variant?.originalPrice
//             ? Math.round(
//                 ((item.variant.originalPrice -
//                   (item.variant.discountedPrice ?? item.variant.displayPrice)) /
//                   item.variant.originalPrice) *
//                   100
//               )
//             : 0),
//         discountAmount:
//           item.variant?.discountAmount ??
//           (item.variant?.originalPrice && item.variant?.discountedPrice
//             ? item.variant.originalPrice - item.variant.discountedPrice
//             : 0),
//       };

//       const productSnapshot = {
//         id: product._id,
//         name: product.name,
//         brand: product.brand,
//         category: product.category,
//       };

//       return {
//         productId: String(product._id),
//         productSnapshot,
//         name: product.name,
//         quantity: item.quantity || 1,
//         price: variantSnapshot.displayPrice, // ✅ correct discounted price
//         variant: variantSnapshot,
//       };
//     });

//     // -------------------- 💾 Save Order --------------------
//     const newOrder = new Order({
//       products: finalCart,
//       orderId,
//       orderNumber: nextOrderNumber,
//       user: user._id,
//       customerName: user.name,
//       date: new Date(),
//       status: "Pending",
//       orderType: "Online",
//       amount: grandTotal,
//       subtotal: priceDetails.bagMrp,
//       totalSavings:
//         priceDetails.bagDiscount +
//         priceDetails.couponDiscount +
//         priceDetails.referralPointsDiscount +
//         priceDetails.giftCardDiscount,
//       couponDiscount: priceDetails.couponDiscount,
//       pointsDiscount: priceDetails.referralPointsDiscount,
//       giftCardDiscount: priceDetails.giftCardDiscount,
//       discountCode: appliedCoupon?.code || null,
//       paid: false,
//       paymentStatus: "pending",
//     });

//     await newOrder.save();

//     // -------------------- 📦 Response --------------------
//     return res.status(200).json({
//       message: "✅ Order initiated",
//       orderId: newOrder._id,
//       displayOrderId: newOrder.orderId,
//       finalAmount: grandTotal,
//       priceBreakdown: priceDetails,
//       cart: finalCart,
//       appliedCoupon,
//       pointsUsed,
//       pointsDiscount,
//       giftCardApplied,
//     });
//   } catch (err) {
//     console.error("initiateOrderFromCart error:", err);
//     return res.status(500).json({
//       message: "Failed to initiate order",
//       error: err.message,
//     });
//   }
// };

export const initiateOrderFromCart = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.cart?.length)
      return res.status(400).json({ message: "Cart is empty" });

    // -------------------- 🧮 Calculate Summary --------------------
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

    // 🧾 Debug summary before order creation
    console.log("🧾 FINAL CART SUMMARY:", JSON.stringify(cart, null, 2));
    console.log("💰 PRICE DETAILS:", priceDetails);

    // -------------------- 🛍 Fetch DB Products --------------------
    const productIds = cart.map((i) => i.product);
    const products = await Product.find({ _id: { $in: productIds } }).lean();

    // -------------------- 🧾 Generate Order ID --------------------
    const latestOrder = await Order.findOne().sort({ createdAt: -1 });
    const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // -------------------- 🧩 Build Cart Snapshot --------------------
    const finalCart = cart.map((item) => {
      const product = products.find(
        (p) => p._id.toString() === item.product.toString()
      );
      if (!product) throw new Error(`Product not found: ${item.product}`);

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
        throw new Error(`Variant not found for product: ${product.name}`);
      }

      // 🧾 Debug variant matching
      console.log("🧾 VARIANT MATCH DETAILS:", {
        product: product.name,
        selectedSku: item.variant?.sku,
        dbSku: dbVariant?.sku,
        itemDisplayPrice: item.variant?.displayPrice,
        dbDiscountedPrice: dbVariant?.discountedPrice,
        dbDisplayPrice: dbVariant?.displayPrice,
      });

      // ✅ Final price priority: Use promo-applied cart variant price FIRST
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

      // 🧾 Debug final price decision
      console.log("✅ FINAL VARIANT PRICE USED:", {
        product: product.name,
        finalPrice,
        variantSnapshot,
      });

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

    // -------------------- 💾 Save Order --------------------
    const newOrder = new Order({
      products: finalCart,
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

    // 🧾 Final confirmation log
    console.log("✅ ORDER CREATED:", {
      id: newOrder._id,
      total: grandTotal,
      productsCount: finalCart.length,
    });

    // -------------------- 📦 Response --------------------
    return res.status(200).json({
      message: "✅ Order initiated",
      orderId: newOrder._id,
      displayOrderId: newOrder.orderId,
      finalAmount: grandTotal,
      priceBreakdown: priceDetails,
      cart: finalCart,
      appliedCoupon,
      pointsUsed,
      pointsDiscount,
      giftCardApplied,
    });
  } catch (err) {
    console.error("❌ initiateOrderFromCart error:", err);
    return res.status(500).json({
      message: "Failed to initiate order",
      error: err.message,
    });
  }
};



// export const initiateOrderFromCart = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     if (!user.cart || !user.cart.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     // -------------------- 🔥 Calculate cart summary --------------------
//     const summaryData = await calculateCartSummary(user, {
//       discount: req.body?.discountCode || req.query?.discount,        // optional
//       pointsToUse: req.body?.pointsToUse || req.query?.pointsToUse,  // optional
//       giftCardCode: req.body?.giftCardCode || req.query?.giftCardCode,    // optional
//       giftCardPin: req.body?.giftCardPin || req.query?.giftCardPin,        // optional
//       giftCardAmount: req.body?.giftCardAmount || req.query?.giftCardAmount // optional
//     });


//     const {
//       cart,
//       priceDetails,
//       appliedCoupon,
//       pointsUsed,
//       pointsDiscount,
//       giftCardApplied,
//       grandTotal,
//     } = summaryData;

//     if (!cart || !cart.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     // -------------------- 📝 Generate order identifiers --------------------
//     const latestOrder = await Order.findOne().sort({ createdAt: -1 });
//     const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
//     const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
//     // -------------------- 💾 Save new order --------------------
//     const newOrder = new Order({
//       products: cart.map((item) => ({
//         productId: item.product, // product _id
//         quantity: item.quantity, // quantity
//         price: item.variant?.discountedPrice || item.variant?.originalPrice || 0, // variant price
//         selectedVariant: item.variant || null, // keep variant details
//       })),
//       orderId,
//       orderNumber: nextOrderNumber,
//       user: user._id,
//       customerName: user.name,
//       date: new Date(),
//       status: "Pending",
//       orderType: "Online",
//       amount: grandTotal,
//       subtotal: priceDetails.bagMrp,
//       totalSavings:
//         priceDetails.bagDiscount +
//         priceDetails.couponDiscount +
//         priceDetails.referralPointsDiscount +
//         priceDetails.giftCardDiscount,
//       couponDiscount: priceDetails.couponDiscount,
//       pointsDiscount: priceDetails.referralPointsDiscount,
//       giftCardDiscount: priceDetails.giftCardDiscount,
//       discountCode: appliedCoupon?.code || null,
//       paid: false,
//       paymentStatus: "pending",
//     });


//     await newOrder.save();

//     // -------------------- 📤 Send response --------------------
//     return res.status(200).json({
//       message: "✅ Order initiated",
//       orderId: newOrder._id,
//       displayOrderId: newOrder.orderId,
//       finalAmount: grandTotal,
//       priceBreakdown: priceDetails,
//       cart,
//       appliedCoupon,
//       pointsUsed,
//       pointsDiscount,
//       giftCardApplied,
//     });
//   } catch (err) {
//     console.error("initiateOrderFromCart error:", err);
//     return res.status(500).json({
//       message: "Failed to initiate order",
//       error: err.message,
//     });
//   }
// };

// export const getOrderTracking = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Validate ObjectId upfront
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ message: "Invalid order ID" });
//     }

//     const order = await Order.findById(id).populate("products.productId");
//     if (!order) {
//       return res.status(404).json({ message: "Order not found" });
//     }

//     let liveTracking = null;

//     // ✅ Fetch Shiprocket tracking only if AWB exists
//     if (order.shipment?.awb_code) {
//       try {
//         const token = await getShiprocketToken();
//         const trackRes = await axios.get(
//           `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
//           { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 } // ⏱ 10s safety timeout
//         );
//         liveTracking = trackRes.data;
//       } catch (err) {
//         console.error("❌ Shiprocket tracking fetch failed:", err.response?.data || err.message);
//         // Still send response gracefully
//         liveTracking = { tracking_data: { shipment_status: "Tracking Unavailable" } };
//       }
//     }

//     // ✅ Always return something
//     return res.json({
//       orderId: order._id,
//       status: order.orderStatus,
//       shipment: {
//         shipment_id: order.shipment?.shipment_id || null,
//         awb_code: order.shipment?.awb_code || null,
//         tracking_url: order.shipment?.tracking_url || null,
//         courier_id: order.shipment?.courier_id || null,
//         courier_name:
//           liveTracking?.tracking_data?.courier_name || order.shipment?.courier_name || null,
//         current_status:
//           liveTracking?.tracking_data?.shipment_status ||
//           order.shipment?.status ||
//           "Created",
//         checkpoints: liveTracking?.tracking_data?.shipment_track || [],
//       },
//       products: order.products.map((item) => ({
//         name: item.productId.name,
//         variant: item.productId.variant,
//         price: item.price,
//         quantity: item.quantity,
//         image: item.productId.images[0],
//         brand: item.productId.brand,
//       })),
//       amount: order.amount,
//       payment: {
//         transactionId: order.transactionId,
//         method: order.paymentMethod,
//         status: order.paymentStatus,
//       },
//       shippingAddress: order.shippingAddress,
//       createdAt: order.createdAt,
//     });
//   } catch (err) {
//     console.error("🔥 getOrderTracking failed:", err.message);
//     return res.status(500).json({
//       message: "Failed to fetch order tracking",
//       error: err.message,
//     });
//   }
// };
export const getOrderTracking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id).populate("products.productId");
    if (!order) return res.status(404).json({ message: "Order not found" });

    // --- Build timeline from trackingHistory
    const timeline = (order.trackingHistory || []).map(t => ({
      status: t.status,
      timestamp: t.timestamp,
      location: t.location || null,
    }));

    // Include shipment as the last step
    if (order.shipment?.status) {
      timeline.push({
        status: order.shipment.status,
        timestamp: order.shipment.assignedAt || order.updatedAt || null,
        location: order.shipment.courier_name || null,
      });
    }

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

    res.json({
      _id: order._id, // ✅ MongoDB ObjectId
      orderId: order.orderId,
      status: order.orderStatus || order.status,
      shipment: {
        shipment_id: order.shipment?.shipment_id || null,
        awb_code: order.shipment?.awb_code || null,
        courier_id: order.shipment?.courier_id || null,
        courier_name: liveTracking?.tracking_data?.courier_name || order.shipment?.courier_name || null,
        current_status:
          liveTracking?.tracking_data?.shipment_status || order.shipment?.status || "Created",
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