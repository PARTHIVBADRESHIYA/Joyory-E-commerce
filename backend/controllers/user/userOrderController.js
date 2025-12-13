import express from "express";
import mongoose from "mongoose";
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import { calculateCartSummary } from "../../middlewares/utils/cartPricingHelper.js";
import axios from "axios";
import { getShiprocketToken, createShiprocketOrder } from "../../middlewares/services/shiprocket.js"; // helper to fetch token


// --------------------------------------------------------
// 🔥 HELPER: FORMAT COURIER STATUS (Nykaa-style)
// --------------------------------------------------------
function formatCourierStatus(raw) {
  const map = {
    "AWB Assigned": "Shipping Label Created",
    "Pickup Scheduled": "Pickup Scheduled",
    "Pickup Exception": "Pickup Attempted",
    "Picked Up": "Picked Up",
    "In Transit": "In Transit",
    "Out For Delivery": "Out For Delivery",
    "Delivered": "Delivered",
    "RTO Initiated": "Returning to Seller",
    "RTO Delivered": "Returned to Seller",
    "Cancelled": "Cancelled"
  };
  return map[raw] || raw;
}


// --------------------------------------------------------
// 🔥 HELPER: FORMAT EVENT DESCRIPTION (Nykaa-style)
// --------------------------------------------------------
function formatCourierDescription(event) {
  const msg = event.description || "";

  if (msg.includes("CANVAS")) return "Direct canvas bag scanned";
  if (msg.includes("OUTSCAN")) return "Shipment outscanned to network";
  if (msg.includes("COMM FLIGHT")) return "Commercial flight delayed/cancelled";
  if (msg.includes("ARRIVED")) return "Shipment arrived at hub";
  if (msg.includes("DEPARTED")) return "Shipment departed from hub";

  return msg;
}


// --------------------------------------------------------
// 🔥 HELPER: BUILD A CLEAN SHIPMENT TIMELINE (Nykaa-style)
// --------------------------------------------------------
export function buildCourierTimeline(history = []) {
  return history
    .map(h => ({
      time: h.timestamp,
      status: formatCourierStatus(h.status),
      description: formatCourierDescription(h),
      location: h.location || ""
    }))
    .sort((a, b) => new Date(b.time) - new Date(a.time));  // NEWEST FIRST
}

//all the things working till 03-12-2025

// export const initiateOrderFromCart = async (req, res) => {
//   try {
//     // ✅ Authentication check
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     // ✅ Fetch user + cart
//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });
//     if (!user.cart?.length)
//       return res.status(400).json({ message: "Cart is empty" });

//     // ✅ Recalculate latest cart summary
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

//     // ✅ Fetch products referenced in cart
//     const productIds = cart.map((i) => i.product);
//     const products = await Product.find({ _id: { $in: productIds } }).lean();

//     // ✅ Generate unique order IDs
//     const latestOrder = await Order.findOne().sort({ createdAt: -1 });
//     const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;
//     const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

//     // ✅ Finalize cart item structure
//     const finalCart = cart.map((item) => {
//       const product = products.find(
//         (p) => p._id.toString() === item.product.toString()
//       );
//       if (!product) throw { userFriendly: true, message: `Product not found: ${item.product}` };

//       let dbVariant =
//         product.variants.find(
//           (v) =>
//             String(v.sku).trim().toLowerCase() ===
//             String(item.variant?.sku).trim().toLowerCase()
//         ) ||
//         product.variants.find(
//           (v) =>
//             String(v.shadeName).trim().toLowerCase() ===
//             String(item.variant?.shadeName).trim().toLowerCase()
//         ) ||
//         product.variants.find(
//           (v) => v._id?.toString() === item.variant?._id?.toString()
//         ) ||
//         product.variants?.[0];

//       if (!dbVariant) {
//         throw { userFriendly: true, message: `Variant not found for product: ${product.name}` };
//       }

//       // ✅ Stock validation (no stack trace)
//       const requestedQty = item.quantity || 1;
//       if (typeof dbVariant.stock !== "number" || dbVariant.stock <= 0) {
//         throw {
//           userFriendly: true,
//           message: `🛒 We’re sorry, but ${product.name} (${dbVariant.shadeName || dbVariant.sku}) is currently unavailable. Please remove this item from your cart to proceed with your order.`,
//         };
//       }

//       if (dbVariant.stock < requestedQty) {
//         throw {
//           userFriendly: true,
//           message: `🛒 Only ${dbVariant.stock} unit${dbVariant.stock > 1 ? "s" : ""} of ${product.name} (${dbVariant.shadeName || dbVariant.sku}) are available. Please adjust the quantity or remove this item from your cart to continue with your order.`,
//         };
//       }

//       const finalPrice =
//         item.variant?.discountedPrice ??
//         item.variant?.displayPrice ??
//         dbVariant.discountedPrice ??
//         dbVariant.displayPrice ??
//         product.price ??
//         0;

//       const variantSnapshot = {
//         sku: dbVariant.sku || item.variant?.sku || null,
//         shadeName: dbVariant.shadeName || item.variant?.shadeName || null,
//         hex: dbVariant.hex || item.variant?.hex || null,
//         images:
//           dbVariant.images?.length
//             ? dbVariant.images
//             : item.variant?.images?.length
//               ? item.variant.images
//               : product.images || [],
//         image:
//           dbVariant.images?.[0] ||
//           item.variant?.image ||
//           product.images?.[0] ||
//           null,
//         stock: typeof dbVariant.stock === "number" ? dbVariant.stock : 0,
//         originalPrice:
//           item.variant?.originalPrice ??
//           dbVariant.originalPrice ??
//           product.price ??
//           0,
//         discountedPrice: finalPrice,
//         displayPrice: finalPrice,
//         discountPercent:
//           item.variant?.discountPercent ??
//           (dbVariant.originalPrice && dbVariant.discountedPrice
//             ? Math.round(
//               ((dbVariant.originalPrice - dbVariant.discountedPrice) /
//                 dbVariant.originalPrice) *
//               100
//             )
//             : 0),
//         discountAmount:
//           item.variant?.discountAmount ??
//           (dbVariant.originalPrice && dbVariant.discountedPrice
//             ? dbVariant.originalPrice - dbVariant.discountedPrice
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
//         price: finalPrice,
//         variant: variantSnapshot,
//       };
//     });

//     // ✅ Create and save new order
//     const newOrder = new Order({
//       products: finalCart,
//       orderId,
//       orderNumber: nextOrderNumber,
//       user: user._id,
//       customerName: user.name,
//       date: new Date(),
//       status: "Pending",
//       orderType: null, // ✅ will be updated later
//       amount: grandTotal,
//       subtotal: priceDetails.bagMrp,
//       totalSavings:
//         priceDetails.bagDiscount +
//         priceDetails.couponDiscount +
//         priceDetails.referralPointsDiscount +
//         priceDetails.giftCardDiscount,
//       shippingCharge: priceDetails.shippingCharge,   // 🔥 NEW

//       couponDiscount: priceDetails.couponDiscount,
//       pointsDiscount: priceDetails.referralPointsDiscount,
//       giftCardDiscount: priceDetails.giftCardDiscount,
//       discountCode: appliedCoupon?.code || null,
//       paid: false,
//       paymentStatus: "pending",
//       isDraft: true, // ✅ this is new
//     });

//     await newOrder.save();

//     return res.status(200).json({
//       message: "✅ Order initiated",
//       orderId: newOrder._id,
//       displayOrderId: newOrder.orderId,
//       nextStep: "SELECT_PAYMENT_METHOD",
//       finalAmount: grandTotal,
//       shippingCharge: priceDetails.shippingCharge,
//       priceBreakdown: priceDetails,
//       cart: finalCart,
//       appliedCoupon,
//       pointsUsed,
//       pointsDiscount,
//       giftCardApplied,
//     });
//   } catch (err) {
//     // ✅ Friendly error logging
//     if (err.userFriendly) {
//       console.log("🟡 User message:", err.message);
//       return res.status(400).json({ success: false, message: err.message });
//     }

//     // ✅ Prevent double response
//     if (res.headersSent) return;

//     console.error("❌ initiateOrderFromCart error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to initiate order. Please try again.",
//     });
//   }
// };
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

    const affSlug = req.query.aff || req.body.aff;

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
      // 🟢 Affiliate meta (saved in draft)
      affiliate: {
        slug: affSlug || null,
        applied: false,
        affiliateUser: null,
        affiliateLink: null,
      },
      subtotal: priceDetails.bagMrp,
      totalSavings:
        priceDetails.bagDiscount +
        priceDetails.couponDiscount +
        priceDetails.referralPointsDiscount +
        priceDetails.giftCardDiscount,
      shippingCharge: priceDetails.shippingCharge,   // 🔥 NEW

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
      shippingCharge: priceDetails.shippingCharge,
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

export function deriveOrderStatusFromShipments(shipments = []) {
  if (!shipments || shipments.length === 0) {
    return "Confirmed"; // Nykaa default when no shipment created yet
  }

  const statuses = shipments.map(s => s?.status || "");

  // ----- PRIORITY LOGIC (Nykaa real behaviour) -----

  // 1️⃣ If ANY shipment is Delivered → 
  //    If ALL delivered → Delivered
  //    else → Partially Shipped
  const anyDelivered = statuses.some(s => s === "Delivered");
  if (anyDelivered) {
    const allDelivered = statuses.every(s => s === "Delivered");
    return allDelivered ? "Delivered" : "Partially Shipped";
  }

  // 2️⃣ If ANY shipment is Out for Delivery → Partially Shipped
  if (statuses.some(s => s === "Out for Delivery")) {
    return "Partially Shipped";
  }

  // 3️⃣ If ANY shipment is In Transit / Shipped / Picked Up → Partially Shipped
  const inMovement = ["In Transit", "Shipped", "Picked Up", "Reached Hub"];
  if (statuses.some(s => inMovement.includes(s))) {
    return "Partially Shipped";
  }

  // 4️⃣ If ALL shipments are Cancelled/Failed → Cancelled
  const allCancelled = statuses.every(s =>
    ["Cancelled", "Failed"].includes(s)
  );
  if (allCancelled) {
    return "Cancelled";
  }

  // 5️⃣ If ANY shipment contains Pickup Scheduled / Awaiting Pickup / Processing → Packed
  const packedSet = ["Pickup Scheduled", "Awaiting Pickup", "Processing", "Assigned"];
  if (statuses.some(s => packedSet.includes(s))) {
    // Nykaa: as soon as any shipment is ready-to-pick → Packed
    return "Packed";
  }

  // 6️⃣ If ALL are Created → Confirmed
  const allCreated = statuses.every(s => s === "Created");
  if (allCreated) {
    return "Confirmed";
  }

  // 7️⃣ Fallback → Processing (Nykaa uses this as "neutral")
  return "Processing";
}

export function calculateOrderExpectedDelivery(shipments = []) {
  if (!shipments || shipments.length === 0) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  let latest = 0;

  for (const s of shipments) {
    const t = s?.expected_delivery ? new Date(s.expected_delivery).getTime() : 0;
    if (!isNaN(t) && t > latest) latest = t;
  }

  return latest
    ? new Date(latest).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}


// Updated getUserOrders (Nykaa-style)
// export const getUserOrders = async (req, res) => {
//   try {
//     const orders = await Order.find({
//       user: req.user._id,
//       isDraft: false
//     })
//       .populate({
//         path: "products.productId",
//         select: "name images brand category variants"
//       })
//       .populate("shipments.products.productId")
//       .sort({ createdAt: -1 })
//       .lean();

//     if (!orders || orders.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: "You haven't placed any orders yet.",
//         orders: []
//       });
//     }

//     // De-duplicate by orderId, keep latest createdAt (if you want)
//     const map = new Map();
//     for (const o of orders) {
//       if (!map.has(o.orderId) || new Date(o.createdAt) > new Date(map.get(o.orderId).createdAt)) {
//         map.set(o.orderId, o);
//       }
//     }
//     const uniqueOrders = Array.from(map.values());

//     const cleanedOrders = uniqueOrders.map(order => {
//       // Order-level timeline (Nykaa-style) — only top-level milestones
//       const orderTimeline = [];
//       // Order Placed
//       orderTimeline.push({
//         status: "Order Placed",
//         timestamp: order.createdAt,
//         location: "System",
//         description: "Your order has been successfully placed",
//         active: true
//       });

//       // Payment success (if applicable)
//       if (order.paid || order.paymentStatus === "success") {
//         orderTimeline.push({
//           status: "Payment Successful",
//           timestamp: order.updatedAt || order.createdAt,
//           location: "Payment Gateway",
//           description: "Payment received",
//           active: false
//         });
//       }

//       // Admin confirmed
//       if (order.adminConfirmed) {
//         const confirmedAt = order.tracking_history?.find(t => t.status === "Admin Confirmed")?.timestamp || order.updatedAt || order.createdAt;
//         orderTimeline.push({
//           status: "Seller Confirmed",
//           timestamp: confirmedAt,
//           location: "Seller",
//           description: "Seller has confirmed your order",
//           active: false
//         });
//       }

//       // Add a 'Packed' milestone if any shipment is awaiting pickup or assigned
//       const anyPacked = (order.shipments || []).some(s => ["Awaiting Pickup", "Pickup Scheduled", "Assigned", "Processing", "Awaiting Pickup"].includes(s.status));
//       if (anyPacked) {
//         orderTimeline.push({
//           status: "Packed",
//           timestamp: order.updatedAt || order.createdAt,
//           location: "Warehouse",
//           description: "Items have been packed and will be handed over to courier",
//           active: false
//         });
//       }

//       // Build shipment-level structures (Nykaa shows each shipment separately)
//       const shipmentsOut = (order.shipments || []).map(shipment => {
//         const products = (shipment.products || []).map(item => {
//           const product = item.productId || {};
//           return {
//             productId: product._id ? String(product._id) : String(item.productId),
//             name: product.name || item.name || "Unknown Product",
//             brand: product.brand || null,
//             category: product.category || null,
//             variant: item.variant?.shadeName || null,
//             image: item.variant?.image || (product.images?.[0] || "https://cdn-icons-png.flaticon.com/512/679/679922.png"),
//             quantity: item.quantity || 1,
//             price: item.price || 0,
//             total: (item.quantity || 1) * (item.price || 0)
//           };
//         });

//         // shipment timeline: only shipment events
//         const shipmentTimeline = (shipment.tracking_history || []).map(t => ({
//           status: t.status,
//           timestamp: t.timestamp,
//           location: t.location || "Courier",
//           description: t.description || ""
//         })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

//         return {
//           shipmentId: String(shipment._id),
//           status: shipment.status || "Created",
//           awbCode: shipment.awb_code || null,
//           courierName: shipment.courier_name || null,
//           trackingUrl: shipment.tracking_url || null,
//           expectedDelivery: shipment.expected_delivery ? new Date(shipment.expected_delivery).toISOString() : null,
//           products,
//           timeline: shipmentTimeline
//         };
//       });

//       // Flat products (for backward compatibility or UI)
//       const productsFlat = [];
//       if (shipmentsOut.length > 0) {
//         for (const s of shipmentsOut) {
//           for (const p of s.products) {
//             productsFlat.push({
//               ...p,
//               shipmentId: s.shipmentId,
//               shipmentStatus: s.status,
//               awbCode: s.awbCode
//             });
//           }
//         }
//       } else {
//         // fallback to order.products
//         for (const item of (order.products || [])) {
//           const product = item.productId || {};
//           productsFlat.push({
//             productId: product._id ? String(product._id) : String(item.productId),
//             name: product.name || item.name || "Unknown Product",
//             brand: product.brand || null,
//             category: product.category || null,
//             variant: item.variant?.shadeName || null,
//             image: item.variant?.image || (product.images?.[0] || "https://cdn-icons-png.flaticon.com/512/679/679922.png"),
//             quantity: item.quantity || 1,
//             price: item.price || 0,
//             total: (item.quantity || 1) * (item.price || 0),
//             shipmentId: null,
//             shipmentStatus: null
//           });
//         }
//       }

//       // compute order status via helper (A1)
//       const orderStatus = deriveOrderStatusFromShipments(order.shipments || []);

//       const expectedDelivery = calculateOrderExpectedDelivery(order.shipments || []);

//       return {
//         _id: order._id,
//         orderId: order.orderId,
//         orderNumber: order.orderNumber,
//         date: order.date || order.createdAt,
//         status: orderStatus,
//         amount: order.amount,
//         shippingAddress: order.shippingAddress || null,
//         timeline: orderTimeline,      // top-level Nykaa-style timeline
//         shipments: shipmentsOut,      // each shipment with its own timeline
//         products: productsFlat,       // flat list for UI or summary
//         payment: {
//           method: order.paymentMethod || "Manual",
//           status: order.paymentStatus || "pending",
//           transactionId: order.transactionId || null
//         },
//         expectedDelivery
//       };
//     });

//     return res.status(200).json({
//       success: true,
//       message: `Found ${cleanedOrders.length} order${cleanedOrders.length > 1 ? "s" : ""}.`,
//       orders: cleanedOrders
//     });
//   } catch (err) {
//     console.error("🔥 Error fetching user orders:", err);
//     return res.status(500).json({ success: false, message: "Failed to fetch your orders. Please try again later." });
//   }
// };

// GET /user/orders

// --------------------------------------------------------
// 🔥 HELPER: CALCULATE ORDER-LEVEL PRICING (Nykaa-Style)
// --------------------------------------------------------
function calculateFinalOrderPricing(order) {

  const subtotal = order.subtotal || 0;
  const totalSavings = order.totalSavings || 0;

  // finalAmount already stored in schema as "amount"
  const finalAmount = order.amount || (subtotal - totalSavings);

  return {
    totalPrice: subtotal,
    totalDiscount: totalSavings,
    finalAmount
  };
}


export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const orders = await Order.find({ user: userId, isDraft: false })
      .select("_id orderId orderNumber createdAt amount shipments orderStatus expected_delivery")
      .populate({
        path: "shipments.products.productId",
        select: "name images brand"
      })
      .sort({ createdAt: -1 })
      .lean();

    if (!orders?.length) {
      return res.status(200).json({ success: true, message: "No orders yet", orders: [] });
    }

    // Build lightweight summary list
    const list = orders.map(o => {
      // Map shipments into simple cards (Shipment 1, Shipment 2)
      const shipments = (o.shipments || []).map((s, idx) => {
        const firstProduct = (s.products && s.products[0]) || {};
        const prod = firstProduct.productId || {};
        return {
          shipmentId: String(s.shipment_id),
          label: `Shipment ${idx + 1}`,
          status: // map to simple 3-step statuses
            (s.status === "Delivered") ? "Delivered" :
              (["Shipped", "Out for Delivery", "In Transit", "Picked Up", "Awaiting Pickup"].includes(s.status)) ? "Shipped" :
                "Confirmed",
          date: s.deliveredAt || s.expected_delivery || o.createdAt,
          products: [
            {
              name: prod.name || firstProduct.name || "Unknown Product",
              variant: firstProduct.variant?.shadeName || firstProduct.variant?.sku || null,
              image: (firstProduct.variant?.image) || (prod.images?.[0]) || null
            }
          ]
        };
      });

      // derive top-level simplified status for UI (Confirmed / Shipped / Delivered)
      const topStatus = deriveOrderStatusFromShipments(o.shipments || []);
      const simpleTopStatus =
        topStatus === "Delivered" ? "Delivered" :
          (topStatus === "Partially Shipped" || topStatus === "Shipped" || topStatus === "Out for Delivery") ? "Shipped" :
            "Confirmed";

      return {
        _id: o._id,
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        date: o.createdAt,
        status: simpleTopStatus,
        amount: o.amount,
        shipments,
        expectedDelivery: calculateOrderExpectedDelivery(o.shipments || [])
      };
    });

    return res.json({ success: true, orders: list });
  } catch (err) {
    console.error("getUserOrders failed:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

// Updated getOrderTracking (Nykaa-style)
export const getOrderTracking = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id)
      .populate("products.productId")
      .populate("shipments.products.productId")
      .lean();

    if (!order) return res.status(404).json({ message: "Order not found" });

    // top-level order timeline (Nykaa style)
    const orderTimeline = [];
    orderTimeline.push({
      status: "Order Placed",
      timestamp: order.createdAt,
      location: "System",
      description: "Your order has been placed",
      active: true
    });

    if (order.paid || order.paymentStatus === "success") {
      orderTimeline.push({
        status: "Payment Successful",
        timestamp: order.updatedAt || order.createdAt,
        location: "Payment Gateway",
        description: "Payment received"
      });
    }

    if (order.adminConfirmed) {
      const confirmedAt = order.tracking_history?.find(t => t.status === "Admin Confirmed")?.timestamp || order.updatedAt || order.createdAt;
      orderTimeline.push({
        status: "Seller Confirmed",
        timestamp: confirmedAt,
        location: "Seller",
        description: "Seller has confirmed your order"
      });
    }

    // Build shipments with timelines
    const cleanShipments = (order.shipments || []).map(shipment => {
      const products = (shipment.products || []).map(item => {
        const product = item.productId || {};
        return {
          productId: product._id ? String(product._id) : String(item.productId),
          name: product.name || item.name || "Unknown Product",
          variant: item.variant?.shadeName || null,
          image: item.variant?.image || (product.images?.[0] || "https://cdn-icons-png.flaticon.com/512/679/679922.png"),
          brand: product.brand || null,
          quantity: item.quantity || 1,
          price: item.price || 0,
          total: (item.price || 0) * (item.quantity || 1)
        };
      });

      const timeline = (shipment.tracking_history || []).map(tr => ({
        status: tr.status,
        timestamp: tr.timestamp,
        location: tr.location || "Courier",
        description: tr.description || ""
      })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      return {
        shipmentId: String(shipment._id),
        awbCode: shipment.awb_code || null,
        courierName: shipment.courier_name || null,
        status: shipment.status || "Created",
        trackingUrl: shipment.tracking_url || null,
        expectedDelivery: shipment.expected_delivery ? new Date(shipment.expected_delivery).toISOString() : null,
        products,
        timeline
      };
    });

    // Build main timeline by adding top-level milestones only (do not mix shipment events)
    // But include latest shipment statuses as separate fields for UI
    const response = {
      _id: String(order._id),
      orderId: order.orderId,
      status: deriveOrderStatusFromShipments(order.shipments || []),
      orderTimeline,
      shipments: cleanShipments,
      amount: order.amount,
      payment: {
        transactionId: order.transactionId || null,
        method: order.paymentMethod || null,
        status: order.paymentStatus || null
      },
      shippingAddress: order.shippingAddress || null,
      createdAt: order.createdAt,
      expectedDelivery: calculateOrderExpectedDelivery(order.shipments || [])
    };

    return res.json(response);
  } catch (err) {
    console.error("🔥 getOrderTracking failed:", err);
    return res.status(500).json({ message: "Failed to fetch order tracking", error: err.message });
  }
};

// export const getShipmentDetails = async (req, res) => {
//   try {
//     const { shipment_id } = req.params;

//     if (!shipment_id) {
//       return res.status(400).json({ success: false, message: "shipment_id is required" });
//     }

//     // Find order containing this shipment
//     const order = await Order.findOne({
//       "shipments.shipment_id": shipment_id
//     })
//       .populate("shipments.products.productId")
//       .lean();

//     if (!order) {
//       return res.status(404).json({ success: false, message: "Shipment not found" });
//     }

//     // Extract specific shipment
//     const shipment = order.shipments.find(s => String(s.shipment_id) === String(shipment_id));
//     if (!shipment) {
//       return res.status(404).json({ success: false, message: "Shipment not found" });
//     }

//     shipment.status = shipment.status || "Created";
//     const rawStatus = shipment.status

//     const simpleShipmentStatus =
//       rawStatus === "Delivered"
//         ? "Delivered"
//         : ["Shipped", "Out for Delivery", "In Transit", "Picked Up", "Awaiting Pickup"].includes(rawStatus)
//           ? "Shipped"
//           : "Confirmed";


//     // PRODUCTS FOR THIS SHIPMENT  (TAKE PRICE FROM ORDER MODEL)
//     const shipmentProducts = shipment.products.map(item => {
//       const p = item.productId || {};

//       const variant = item.variant || {};

//       const MRP = variant.originalPrice || 0;      // MRP
//       const SP = variant.displayPrice || 0;        // Discounted Selling Price
//       const additionalDiscount =
//         MRP > SP ? (MRP - SP) : (variant.discountAmount || 0);

//       return {
//         productId: p._id,
//         name: p.name || item.name,
//         variant: variant.shadeName || variant.sku || null,
//         image: variant.image || p.images?.[0] || null,

//         qty: item.quantity || 1,

//         // PRICE FIELDS (Nykaa style)
//         mrp: MRP,
//         sellingPrice: SP,
//         additionalDiscount,
//         total: SP * (item.quantity || 1)
//       };
//     });

//     // OTHER ITEMS IN ORDER (NOT IN THIS SHIPMENT)
//     const otherItems = order.shipments
//       .filter(s => s.shipment_id !== shipment_id)
//       .flatMap(s =>
//         s.products.map(item => {
//           const p = item.productId || {};
//           return {
//             productId: p._id,
//             name: p.name || item.name,
//             variant: item.variant?.shadeName || item.variant?.sku || null,
//             image: item.variant?.image || p.images?.[0] || null
//           };
//         })
//       );

//     const shippingAddress = order.shippingAddress
//       ? {
//         name: order.shippingAddress.name || "",
//         email: order.shippingAddress.email || "",
//         phone: order.shippingAddress.phone || "",
//         pincode: order.shippingAddress.pincode || "",
//         city: order.shippingAddress.city || "",
//         state: order.shippingAddress.state || "",
//         country: order.shippingAddress.country || "India",
//         addressLine1: order.shippingAddress.addressLine1 || "",
//         addressLine2: order.shippingAddress.addressLine2 || ""
//       }
//       : null;



//     // SHIPMENT PRICE TOTAL
//     const shipmentTotals = {
//       mrpTotal: shipmentProducts.reduce((sum, p) => sum + (p.mrp * p.qty), 0),
//       sellingPriceTotal: shipmentProducts.reduce((sum, p) => sum + (p.sellingPrice * p.qty), 0),
//       additionalDiscountTotal: shipmentProducts.reduce((sum, p) => sum + (p.additionalDiscount * p.qty), 0)
//     };

//     // ORDER PRICE SUMMARY (Nykaa style)
//     const orderPriceSummary = {
//       subtotal: order.subtotal || order.amount || 0,
//       discount: order.discount || 0,
//       tax: order.tax || 0,
//       shippingCharge: order.shippingCharge || 0,
//       finalAmount: order.amount || 0
//     };

//     // COURIER TIMELINE
//     const trackingTimeline = (shipment.tracking_history || [])
//       .map(t => ({
//         status: t.status,
//         timestamp: t.timestamp,
//         location: t.location || null
//       }))
//       .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

//     // FINAL RESPONSE
//     return res.json({
//       success: true,
//       shipmentId: shipment.shipment_id,
//       shipmentStatus: simpleShipmentStatus,

//       expectedDelivery: shipment.expected_delivery || null,

//       courier: {
//         name: shipment.courier_name || null,
//         awb: shipment.awb_code || null,
//         trackingUrl: shipment.tracking_url || null
//       },

//       products: shipmentProducts,

//       shippingAddress,

//       priceDetails: {
//         mrpTotal: shipmentTotals.mrpTotal,                       // Sum of all MRP
//         sellingPriceTotal: shipmentTotals.sellingPriceTotal,     // Sum of SP
//         additionalDiscountTotal: shipmentTotals.additionalDiscountTotal,
//         totalPaid: shipmentTotals.sellingPriceTotal               // user actually paid this
//       },


//       otherItems,

//       orderPriceSummary,

//       trackingTimeline,

//       orderInfo: {
//         orderId: order.orderId,
//         orderDate: order.createdAt,
//         day: new Date(order.createdAt).toLocaleDateString("en-IN", {
//           weekday: "long"
//         }),
//         deliveryPartner: shipment.courier_name || null,
//         awb: shipment.awb_code || null
//       }
//     });
//   } catch (err) {
//     console.error("getShipmentDetails failed:", err);
//     return res.status(500).json({ success: false, message: "Failed to fetch shipment details" });
//   }
// };
// --------------------------------------------------------
// 🔥 MAIN CONTROLLER
// --------------------------------------------------------

export const getShipmentDetails = async (req, res) => {
  try {
    const { shipment_id } = req.params;

    if (!shipment_id) {
      return res.status(400).json({ success: false, message: "shipment_id is required" });
    }

    // ------------------------------------------------------------------
    // FIND THE ORDER WHICH CONTAINS THIS SHIPMENT
    // ------------------------------------------------------------------
    const order = await Order.findOne({
      "shipments.shipment_id": shipment_id
    })
      .populate("shipments.products.productId")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    // ------------------------------------------------------------------
    // EXTRACT EXACT SHIPMENT DATA
    // ------------------------------------------------------------------
    const shipment = order.shipments.find(
      s => String(s.shipment_id) === String(shipment_id)
    );

    if (!shipment) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    // ------------------------------------------------------------------
    // FINAL SHIPMENT STATUS (DIRECTLY FROM SCHEMA FIELD)
    // ------------------------------------------------------------------
    const finalShipmentStatus = shipment.status || "Created";

    // ------------------------------------------------------------------
    // BUILD PRODUCT LIST (schema-accurate)
    // ------------------------------------------------------------------
    const shipmentProducts = shipment.products.map(item => {
      const p = item.productId || {};
      const variant = item.variant || {};

      return {
        productId: p._id,
        name: p.name,
        variant: variant.shadeName || variant.sku || null,
        image: variant.image || p.images?.[0] || null,

        qty: item.quantity,

        mrp: variant.originalPrice || 0,
        sellingPrice: variant.displayPrice || 0,
        total: (variant.displayPrice || 0) * item.quantity
      };
    });

    // ------------------------------------------------------------------
    // OTHER ITEMS (other shipments)
    // ------------------------------------------------------------------
    const otherItems = order.shipments
      .filter(s => s.shipment_id !== shipment_id)
      .flatMap(s =>
        s.products.map(item => ({
          productId: item.productId?._id,
          name: item.productId?.name || item.name,
          variant: item.variant?.shadeName || item.variant?.sku || null,
          image: item.variant?.image || item.productId?.images?.[0] || null
        }))
      );

    // ------------------------------------------------------------------
    // SHIPPING ADDRESS (direct from schema)
    // ------------------------------------------------------------------
    const shippingAddress = order.shippingAddress
      ? {
        name: order.shippingAddress.name || "",
        email: order.shippingAddress.email || "",
        phone: order.shippingAddress.phone || "",
        pincode: order.shippingAddress.pincode || "",
        city: order.shippingAddress.city || "",
        state: order.shippingAddress.state || "",
        country: order.shippingAddress.country || "India",
        addressLine1: order.shippingAddress.addressLine1 || "",
        addressLine2: order.shippingAddress.addressLine2 || ""
      }
      : null;

    // ------------------------------------------------------------------
    // PRICE SUMMARY (Shipment Wise)
    // ------------------------------------------------------------------
    const mrpTotal = shipmentProducts.reduce((sum, p) => sum + p.mrp * p.qty, 0);
    const sellingPriceTotal = shipmentProducts.reduce(
      (sum, p) => sum + p.sellingPrice * p.qty,
      0
    );

    // ------------------------------------------------------------------
    // SHIPPING CHARGE LOGIC (Based on your order schema)
    // ------------------------------------------------------------------
    let shippingDiscount = 0;

    if (order.amount >= 499) {
      shippingDiscount = order.shippingCharge || 0; // you stored shippingCharge in order schema
    }

    const additionalDiscounts = {
      shippingDiscount,
      message: shippingDiscount > 0 ? "Free delivery on orders above ₹499" : null
    };

    // ------------------------------------------------------------------
    // TRACKING HISTORY (schema-accurate)
    // ------------------------------------------------------------------
    const trackingTimeline = shipment.tracking_history || [];

    // ------------------------------------------------------------------
    // FINAL RESPONSE (0 assumptions)
    // ------------------------------------------------------------------
    return res.json({
      success: true,

      shipmentId: shipment.shipment_id,
      shipmentStatus: finalShipmentStatus,
      expectedDelivery: shipment.expected_delivery || null,

      courier: {
        name: shipment.courier_name || null,
        awb: shipment.awb_code || null,
        trackingUrl: shipment.tracking_url || null
      },

      products: shipmentProducts,
      otherItems,
      shippingAddress,

      priceDetails: {
        mrpTotal,
        sellingPriceTotal,
        totalPaid: sellingPriceTotal,
        additionalDiscounts
      },

      trackingTimeline,

      orderInfo: {
        orderId: order.orderId,
        orderNumber: order.orderNumber || null,
        orderDate: order.createdAt,
        day: new Date(order.createdAt).toLocaleDateString("en-IN", {
          weekday: "long"
        }),
        deliveryPartner: shipment.courier_name || null,
        awb: shipment.awb_code || null
      }
    });
  } catch (err) {
    console.error("getShipmentDetails failed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipment details"
    });
  }
};
