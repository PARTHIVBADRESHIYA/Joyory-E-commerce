import express from "express";
import mongoose from "mongoose";
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import { calculateCartSummary } from "../../middlewares/utils/cartPricingHelper.js";
import axios from "axios";
// import { getShiprocketToken, createShiprocketOrder } from "../../middlewares/services/shiprocket.js"; // helper to fetch token
import { sendEmail } from "../../middlewares/utils/emailService.js";
// import { cancelShiprocketShipment } from "../../middlewares/services/shiprocket.js";
import UserActivity from "../../models/UserActivity.js";

import { cancelDelhiveryShipment } from "../../middlewares/services/delhiveryService.js";
import { computeOrderStatus } from "../../controllers/orderController.js";


// export function mapShipmentToUIStatus(shipment) {
//   if (!shipment) return "Confirmed";

//   // 1️⃣ Delivered
//   if (
//     shipment.status === "Delivered" ||
//     shipment.status === "RTO Delivered"
//   ) {
//     return "Delivered";
//   }

//   // 2️⃣ Shipped
//   const shippedStatuses = [
//     "AWB Assigned",
//     "Pickup Scheduled",
//     "Pickup Done",
//     "In Transit",
//     "Out for Delivery",
//     "Shipped",
//     "Awaiting Pickup"
//   ];

//   if (shippedStatuses.includes(shipment.status)) {
//     return "Shipped";
//   }

//   // 3️⃣ Default
//   return "Confirmed";
// }


export function mapShipmentToUIStatus(shipment) {
  if (!shipment) return "Confirmed";

  const status = shipment.status?.toLowerCase?.() || "";

  // 4️⃣ Cancelled (TOP PRIORITY)
  if (
    status === "cancelled" ||
    status.includes("cancel") ||
    status.includes("rto")
  ) {
    return "Cancelled";
  }

  // 1️⃣ Delivered
  if (
    status === "delivered" ||
    status === "rto delivered"
  ) {
    return "Delivered";
  }

  // 2️⃣ Shipped
  const shippedStatuses = [
    "awb assigned",
    "pickup scheduled",
    "picked up",
    "pickup done",
    "in transit",
    "out for delivery",
    "shipped",
    "awaiting pickup"
  ];

  if (shippedStatuses.includes(status)) {
    return "Shipped";
  }

  // 3️⃣ Default
  return "Confirmed";
}


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

function formatCourierDescription(event) {
  const msg = event.description || "";

  if (msg.includes("CANVAS")) return "Direct canvas bag scanned";
  if (msg.includes("OUTSCAN")) return "Shipment outscanned to network";
  if (msg.includes("COMM FLIGHT")) return "Commercial flight delayed/cancelled";
  if (msg.includes("ARRIVED")) return "Shipment arrived at hub";
  if (msg.includes("DEPARTED")) return "Shipment departed from hub";

  return msg;
}

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

    // 🔥 STOP abandoned cart emails
    await User.findByIdAndUpdate(user._id, {
      $set: {
        "abandonedCart.isActive": false,
        "abandonedCart.checkoutStartedAt": new Date()
      }
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

    // Safe affiliate slug
    const affSlug = (req.query?.aff) || (req.body?.aff) || null;

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
      gst: {
        rate: priceDetails.gstRate,       // "12%"
        amount: priceDetails.gstAmount,
        taxableAmount: priceDetails.taxableAmount,
        message: priceDetails.gstMessage,
      },
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

    // 🔥 Log checkout activity for analytics
    await UserActivity.create({
      user: user._id,
      type: "checkout",
      product: null,   // checkout is not product-specific
      category: null
    });

    // 🔥 Funnel tracking: Checkout initiated
    await User.findByIdAndUpdate(
      req.user._id,
      [
        {
          $set: {
            "conversionStats.checkoutCount": {
              $add: [
                { $ifNull: ["$conversionStats.checkoutCount", 0] },
                1
              ]
            }
          }
        }
      ]
    );

    return res.status(200).json({
      message: "✅ Order initiated",
      orderId: newOrder._id,
      displayOrderId: newOrder.orderId,
      nextStep: "SELECT_PAYMENT_METHOD",
      finalAmount: grandTotal,
      shippingCharge: priceDetails.shippingCharge,
      priceBreakdown: priceDetails,
      gst: {
        amount: priceDetails.gstAmount,
        message: priceDetails.gstMessage,
      },
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
          shipment_id: String(s._id),
          label: `Shipment ${idx + 1}`,
          status: s.status,
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

      return {
        _id: o._id,
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        date: o.createdAt,
        amount: o.amount,
        shipments
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
        shipment_id: String(shipment._id),
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

//     // ------------------------------------------------------------------
//     // FIND THE ORDER WHICH CONTAINS THIS SHIPMENT
//     // ------------------------------------------------------------------
//     const order = await Order.findOne({
//       "shipments.shipment_id": shipment_id
//     })
//       .populate("shipments.products.productId")
//       .lean();

//     if (!order) {
//       return res.status(404).json({ success: false, message: "Shipment not found" });
//     }

//     // ------------------------------------------------------------------
//     // EXTRACT EXACT SHIPMENT DATA
//     // ------------------------------------------------------------------
//     const shipment = order.shipments.find(
//       s => String(s.shipment_id) === String(shipment_id)
//     );

//     if (!shipment) {
//       return res.status(404).json({ success: false, message: "Shipment not found" });
//     }

//     // ------------------------------------------------------------------
//     // FINAL SHIPMENT STATUS (DIRECTLY FROM SCHEMA FIELD)
//     // ------------------------------------------------------------------
//     const finalShipmentStatus = shipment.status || "Created";

//     // ------------------------------------------------------------------
//     // BUILD PRODUCT LIST (schema-accurate)
//     // ------------------------------------------------------------------
//     const shipmentProducts = shipment.products.map(item => {
//       const p = item.productId || {};
//       const variant = item.variant || {};

//       return {
//         productId: p._id,
//         name: p.name,
//         variant: variant.shadeName || variant.sku || null,
//         image: variant.image || p.images?.[0] || null,

//         qty: item.quantity,

//         mrp: variant.originalPrice || 0,
//         sellingPrice: variant.displayPrice || 0,
//         total: (variant.displayPrice || 0) * item.quantity
//       };
//     });

//     // ------------------------------------------------------------------
//     // OTHER ITEMS (other shipments)
//     // ------------------------------------------------------------------
//     const otherItems = order.shipments
//       .filter(s => s.shipment_id !== shipment_id)
//       .flatMap(s =>
//         s.products.map(item => ({
//           productId: item.productId?._id,
//           name: item.productId?.name || item.name,
//           variant: item.variant?.shadeName || item.variant?.sku || null,
//           image: item.variant?.image || item.productId?.images?.[0] || null
//         }))
//       );

//     // ------------------------------------------------------------------
//     // SHIPPING ADDRESS (direct from schema)
//     // ------------------------------------------------------------------
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

//     // ------------------------------------------------------------------
//     // PRICE SUMMARY (Shipment Wise)
//     // ------------------------------------------------------------------
//     const mrpTotal = shipmentProducts.reduce((sum, p) => sum + p.mrp * p.qty, 0);
//     const sellingPriceTotal = shipmentProducts.reduce(
//       (sum, p) => sum + p.sellingPrice * p.qty,
//       0
//     );

//     // ------------------------------------------------------------------
//     // SHIPPING CHARGE LOGIC (Based on your order schema)
//     // ------------------------------------------------------------------
//     let shippingDiscount = 0;

//     if (order.amount >= 499) {
//       shippingDiscount = order.shippingCharge || 0; // you stored shippingCharge in order schema
//     }

//     const additionalDiscounts = {
//       shippingDiscount,
//       message: shippingDiscount > 0 ? "Free delivery on orders above ₹499" : null
//     };

//     // ------------------------------------------------------------------
//     // TRACKING HISTORY (schema-accurate)
//     // ------------------------------------------------------------------
//     const trackingTimeline = shipment.tracking_history || [];

//     // ------------------------------------------------------------------
//     // FINAL RESPONSE (0 assumptions)
//     // ------------------------------------------------------------------
//     return res.json({
//       success: true,

//       shipmentId: shipment.shipment_id,
//       shipmentStatus: finalShipmentStatus,
//       expectedDelivery: shipment.expected_delivery || null,

//       courier: {
//         name: shipment.courier_name || null,
//         awb: shipment.awb_code || null,
//         trackingUrl: shipment.tracking_url || null
//       },

//       products: shipmentProducts,
//       otherItems,
//       shippingAddress,

//       priceDetails: {
//         mrpTotal,
//         sellingPriceTotal,
//         totalPaid: sellingPriceTotal,
//         additionalDiscounts
//       },

//       trackingTimeline,

//       orderInfo: {
//         orderId: order.orderId,
//         orderNumber: order.orderNumber || null,
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
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch shipment details"
//     });  
//   }
// };


// export const getShipmentDetails = async (req, res) => {
//   try {
//     const { shipment_id } = req.params;

//     if (!shipment_id) {
//       return res.status(400).json({ success: false, message: "shipment_id is required" });
//     }

//     // ------------------------------------------------------------------
//     // FIND THE ORDER WHICH CONTAINS THIS SHIPMENT
//     // ------------------------------------------------------------------
//     const order = await Order.findOne({
//       "shipments.shipment_id": shipment_id
//     })
//       .populate("shipments.products.productId")
//       .lean();

//     if (!order) {
//       return res.status(404).json({ success: false, message: "Shipment not found" });
//     }

//     // ------------------------------------------------------------------
//     // EXTRACT EXACT SHIPMENT DATA
//     // ------------------------------------------------------------------
//     const shipment = order.shipments.find(
//       s => String(s.shipment_id) === String(shipment_id)
//     );

//     if (!shipment) {
//       return res.status(404).json({ success: false, message: "Shipment not found" });
//     }

//     // ------------------------------------------------------------------
//     // FINAL SHIPMENT STATUS (DIRECTLY FROM SCHEMA FIELD)
//     // ------------------------------------------------------------------
//     const finalShipmentStatus = mapShipmentToUIStatus(shipment);

//     // ------------------------------------------------------------------
//     // BUILD PRODUCT LIST (schema-accurate)
//     // ------------------------------------------------------------------
//     const shipmentProducts = shipment.products.map(item => {
//       const p = item.productId || {};
//       const variant = item.variant || {};

//       return {
//         productId: p._id,
//         name: p.name,
//         variant: variant.shadeName || variant.sku || null,
//         image: variant.image || p.images?.[0] || null,

//         qty: item.quantity,

//         mrp: variant.originalPrice || 0,
//         sellingPrice: variant.displayPrice || 0,
//         total: (variant.displayPrice || 0) * item.quantity
//       };
//     });

//     // ------------------------------------------------------------------
//     // OTHER ITEMS (other shipments)
//     // ------------------------------------------------------------------
//     const otherItems = order.shipments
//       .filter(s => s.shipment_id !== shipment_id)
//       .flatMap(s =>
//         s.products.map(item => ({
//           productId: item.productId?._id,
//           name: item.productId?.name || item.name,
//           variant: item.variant?.shadeName || item.variant?.sku || null,
//           image: item.variant?.image || item.productId?.images?.[0] || null
//         }))
//       );

//     // ------------------------------------------------------------------
//     // SHIPPING ADDRESS (direct from schema)
//     // ------------------------------------------------------------------
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

//     // ------------------------------------------------------------------
//     // PRICE SUMMARY (Shipment Wise)
//     // ------------------------------------------------------------------
//     const mrpTotal = shipmentProducts.reduce((sum, p) => sum + p.mrp * p.qty, 0);
//     const sellingPriceTotal = shipmentProducts.reduce(
//       (sum, p) => sum + p.sellingPrice * p.qty,
//       0
//     );

//     // ------------------------------------------------------------------
//     // SHIPPING CHARGE LOGIC (Based on your order schema)
//     // ------------------------------------------------------------------
//     let shippingDiscount = 0;
//     if (order.amount >= 499) {
//       shippingDiscount = order.shippingCharge || 0;
//     }

//     const additionalDiscounts = {
//       shippingDiscount,
//       message: shippingDiscount > 0 ? "Free delivery on orders above ₹499" : null
//     };

//     // ------------------------------------------------------------------
//     // GST CALCULATION (FROM ORDER SCHEMA)
//     // ------------------------------------------------------------------
//     const gstDetails = {
//       rate: order.gst?.rate || 0,                   // e.g., 12%
//       taxableAmount: order.gst?.taxableAmount || sellingPriceTotal,
//       gstAmount: order.gst?.amount || ((sellingPriceTotal * (order.gst?.rate || 0)) / 100),
//       totalWithGST: (sellingPriceTotal || 0) + ((sellingPriceTotal * (order.gst?.rate || 0)) / 100)
//     };

//     // ------------------------------------------------------------------
//     // TRACKING HISTORY (schema-accurate)
//     // ------------------------------------------------------------------
//     const trackingTimeline = shipment.tracking_history || [];

//     // ------------------------------------------------------------------
//     // FINAL RESPONSE (0 assumptions)
//     // ------------------------------------------------------------------
//     return res.json({
//       success: true,

//       shipmentId: shipment.shipment_id,
//       shipmentStatus: finalShipmentStatus,
//       expectedDelivery: shipment.expected_delivery || null,

//       courier: {
//         name: shipment.courier_name || null,
//         awb: shipment.awb_code || null,
//         trackingUrl: shipment.tracking_url || null
//       },

//       products: shipmentProducts,
//       otherItems,
//       shippingAddress,

//       priceDetails: {
//         mrpTotal,
//         sellingPriceTotal,
//         totalPaid: sellingPriceTotal,
//         additionalDiscounts,
//         gst: gstDetails
//       },

//       trackingTimeline,

//       orderInfo: {
//         orderId: order.orderId,
//         orderNumber: order.orderNumber || null,
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
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch shipment details"
//     });
//   }
// };

function formatAmount(num) {
  return Number(num).toFixed(2);
}


export const getShipmentDetails = async (req, res) => {
  try {
    const { shipment_id } = req.params;

    if (!shipment_id) {
      return res.status(400).json({ success: false, message: "shipment_id is required" });
    }

    const order = await Order.findOne({
      "shipments._id": shipment_id
    })
      .populate("shipments.products.productId")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    const shipment = order.shipments.find(
      s => String(s._id) === String(shipment_id)
    );

    if (!shipment) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    const shipmentStatus = shipment.status;

    // --------------------------------------------------
    // SHIPMENT PRODUCTS (UNCHANGED)
    // --------------------------------------------------
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

    const otherItems = order.shipments
      .filter(s => String(s._id) !== String(shipment_id))
      .flatMap(s =>
        s.products.map(item => ({
          productId: item.productId?._id,
          name: item.productId?.name || item.name,
          variant: item.variant?.shadeName || item.variant?.sku || null,
          image: item.variant?.image || item.productId?.images?.[0] || null
        }))
      );

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

    // ==================================================
    // ✅ ORDER PRICE DETAILS (CORRECT DIRECTION)
    // ==================================================

    // 1️⃣ Total MRP (originalPrice)
    const totalMRP = order.products.reduce((sum, item) => {
      return sum + ((item.variant?.originalPrice || 0) * (item.quantity || 0));
    }, 0);

    // 2️⃣ Discounted Price (displayPrice)
    const discountedTotalMRP = order.products.reduce((sum, item) => {
      return sum + ((item.variant?.displayPrice || 0) * (item.quantity || 0));
    }, 0);

    // 3️⃣ Other discounts
    let otherDiscounts = 0;

    // Coupon discount
    if (order.couponDiscount > 0) {
      otherDiscounts += order.couponDiscount;
    }

    // Free delivery benefit (only if shippingCharge = 0)
    if (order.shippingCharge === 0) {
      otherDiscounts += 0; // benefit is delivery was free
    }

    // 4️⃣ Final order total (already stored)
    const orderTotal = order.amount || 0;

    // 5️⃣ You saved
    const otherCharges = order?.gst?.amount || 0;

    const youSaved = order.totalSavings || 0;

    // ==================================================
    // PRICE DETAILS (FRONTEND FRIENDLY)
    // ==================================================
    const priceDetails = {
      totalMRP: formatAmount(totalMRP),
      discountedTotalMRP: formatAmount(discountedTotalMRP),
      otherCharges: formatAmount(otherCharges),
      otherDiscounts: formatAmount(otherDiscounts > 0 ? -otherDiscounts : 0),
      orderTotal: formatAmount(orderTotal),
      youSaved: formatAmount(youSaved),
      paymentMode: order.orderType || null
    };



    // --------------------------------------------------
    // TRACKING
    // --------------------------------------------------
    const trackingTimeline = shipment.tracking_history || [];

    // ==================================================
    // FINAL RESPONSE
    // ==================================================
    return res.json({
      success: true,

      shipmentId: String(shipment._id),
      shipmentStatus,
      expectedDelivery: shipment.expected_delivery || null,

      courier: {
        name: shipment.courier_name || null,
        awb: shipment.waybill || null,
        trackingUrl: shipment.tracking_url || null
      },

      products: shipmentProducts,
      otherItems,
      shippingAddress,

      // ✅ UPDATED PRICE DETAILS (ORDER LEVEL)
      priceDetails,

      // ✅ ADDED
      orderType: order.orderType || null,
      paymentMethod: order.paymentMethod || null,

      trackingTimeline,

      orderInfo: {
        _id: order._id,              // ✅ ADD THIS
        orderId: order.orderId,
        orderNumber: order.orderNumber || null,
        orderDate: order.createdAt,
        day: new Date(order.createdAt).toLocaleDateString("en-IN", {
          weekday: "long"
        }),
        deliveryPartner: shipment.courier_name || null,
        awb: shipment.waybill || null
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


//perfect working bro till 08-01-2026

// export const cancelShipment = async (req, res) => {
//   const session = await mongoose.startSession();

//   try {
//     const { shipment_id } = req.params;
//     const { orderId, reason } = req.body;
//     const userId = req.user._id;

//     if (!reason || !reason.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "Cancellation reason is required"
//       });
//     }

//     // =================================================
//     // 🔎 FETCH DATA (NO TRANSACTION YET)
//     // =================================================
//     const order = await Order.findOne({
//       _id: orderId,
//       user: userId
//     });

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found or unauthorized"
//       });
//     }

//     const shipment = order.shipments.id(shipment_id);
//     if (!shipment) {
//       return res.status(404).json({
//         success: false,
//         message: "Shipment not found"
//       });
//     }

//     if (shipment.status === "Cancelled") {
//       return res.status(400).json({
//         success: false,
//         message: "Shipment already cancelled"
//       });
//     }

//     const blockedStatuses = [
//       "Picked Up",
//       "In Transit",
//       "Out for Delivery",
//       "Delivered"
//     ];

//     if (blockedStatuses.includes(shipment.status)) {
//       return res.status(400).json({
//         success: false,
//         message: `Shipment cannot be cancelled because it is already ${shipment.status}`
//       });
//     }

//     // =================================================
//     // 🚚 PHASE 1: DELHIVERY CANCEL (CRITICAL)
//     // =================================================
//     const waybill =
//       shipment.waybill ||
//       shipment.awb ||
//       shipment.courier?.awb;

//     if (!waybill) {
//       return res.status(400).json({
//         success: false,
//         message: "Waybill not found. Cannot cancel shipment."
//       });
//     }

//     try {
//       await cancelDelhiveryShipment(waybill);
//     } catch (err) { 
//       console.error("❌ Delhivery cancellation failed:", err.message);
//       return res.status(502).json({
//         success: false,
//         message: "Unable to cancel shipment with courier. Please try later."
//       });
//     }

//     // =================================================
//     // 🧾 PHASE 2: DB TRANSACTION (SAFE NOW)
//     // =================================================
//     await session.withTransaction(async () => {
//       const txOrder = await Order.findOne({
//         _id: orderId,
//         user: userId
//       }).session(session);

//       const txShipment = txOrder.shipments.id(shipment_id);

//       txShipment.status = "Cancelled";
//       txShipment.tracking_history.push({
//         status: "Cancelled",
//         timestamp: new Date(),
//         description: "Shipment cancelled by user"
//       });

//       const statuses = txOrder.shipments.map(s => s.status);

//       if (statuses.every(s => s === "Cancelled")) {
//         txOrder.orderStatus = "Cancelled";
//       } else if (statuses.some(s => s === "Cancelled")) {
//         txOrder.orderStatus = "Partially Cancelled";
//       }

//       txOrder.cancellation = {
//         cancelledBy: userId,
//         reason,
//         requestedAt: new Date(),
//         allowed: true
//       };

//       // 🔁 STOCK ROLLBACK
//       if (txOrder.adminConfirmed) {
//         for (const item of txShipment.products) {
//           const product = await Product.findById(item.productId).session(session);
//           if (!product) continue;

//           const variant = product.variants.find(
//             v => v.sku === item.variant?.sku
//           );
//           if (!variant) continue;

//           const qty = Number(item.quantity || 0);

//           const wh = variant.stockByWarehouse.find(
//             w => w.warehouseCode === txShipment.warehouseCode
//           );

//           if (wh) wh.stock += qty;

//           variant.stock = variant.stockByWarehouse.reduce(
//             (sum, w) => sum + w.stock,
//             0
//           );

//           variant.sales = Math.max(0, (variant.sales || 0) - qty);

//           await product.save({ session });
//         }
//       }

//       await txOrder.save({ session });
//     });

//     return res.json({
//       success: true,
//       message: "Shipment cancelled successfully"
//     });

//   } catch (err) {
//     console.error("CANCEL SHIPMENT ERROR:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Something went wrong"
//     });
//   } finally {
//     await session.endSession();
//   }
// };

export const cancelShipment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { shipment_id } = req.params;
    const { orderId, reason } = req.body;
    const userId = req.user._id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required"
      });
    }

    // =================================================
    // 🔎 FETCH DATA (NO TRANSACTION YET)
    // =================================================
    const order = await Order.findOne({
      _id: orderId,
      user: userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or unauthorized"
      });
    }

    const shipment = order.shipments.id(shipment_id);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    if (shipment.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Shipment already cancelled"
      });
    }

    const blockedStatuses = [
      "Picked Up",
      "In Transit",
      "Out for Delivery",
      "Delivered"
    ];

    if (blockedStatuses.includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message: `Shipment cannot be cancelled because it is already ${shipment.status}`
      });
    }

    // =================================================
    // 🚚 PHASE 1: DELHIVERY CANCEL (CRITICAL)
    // =================================================
    const waybill =
      shipment.waybill ||
      shipment.awb ||
      shipment.courier?.awb;

    if (!waybill) {
      return res.status(400).json({
        success: false,
        message: "Waybill not found. Cannot cancel shipment."
      });
    }

    try {
      await cancelDelhiveryShipment(waybill);
    } catch (err) {
      console.error("❌ Delhivery cancellation failed:", err.message);
      return res.status(502).json({
        success: false,
        message: "Unable to cancel shipment with courier. Please try later."
      });
    }

    // =================================================
    // 🧾 PHASE 2: DB TRANSACTION (SAFE NOW)
    // =================================================
    await session.withTransaction(async () => {
      const txOrder = await Order.findOne({
        _id: orderId,
        user: userId
      }).session(session);

      const txShipment = txOrder.shipments.id(shipment_id);

      txShipment.status = "Cancelled";
      txShipment.tracking_history.push({
        status: "Cancelled",
        timestamp: new Date(),
        description: "Shipment cancelled by user"
      });

      const statuses = txOrder.shipments.map(s => s.status);

      if (statuses.every(s => s === "Cancelled")) {
        txOrder.orderStatus = "Cancelled";
      } else if (statuses.some(s => s === "Cancelled")) {
        txOrder.orderStatus = "Partially Cancelled";
      }

      txOrder.cancellation = {
        cancelledBy: userId,
        reason,
        requestedAt: new Date(),
        allowed: true
      };

      // 🔁 STOCK ROLLBACK
      if (txOrder.adminConfirmed) {
        for (const item of txShipment.products) {
          const product = await Product.findById(item.productId).session(session);
          if (!product) continue;

          const variant = product.variants.find(
            v => v.sku === item.variant?.sku
          );
          if (!variant) continue;

          const qty = Number(item.quantity || 0);

          const wh = variant.stockByWarehouse.find(
            w => w.warehouseCode === txShipment.warehouseCode
          );

          if (wh) wh.stock += qty;

          variant.stock = variant.stockByWarehouse.reduce(
            (sum, w) => sum + w.stock,
            0
          );

          variant.sales = Math.max(0, (variant.sales || 0) - qty);

          await product.save({ session });
        }
      }

      await txOrder.save({ session });
    });

    const freshOrder = await Order.findById(orderId).populate("user");

    const derivedOrderStatus = (() => {
      const statuses = freshOrder.shipments.map(s => s.status);

      if (statuses.every(s => s === "Cancelled")) return "Cancelled";
      if (statuses.some(s => s === "Cancelled")) return "Partially Cancelled";

      return freshOrder.orderStatus || "Updated";
    })();


    // =================================================
    // 📧 EMAIL NOTIFICATION (NON-BLOCKING)
    // =================================================
    if (order.user && order.user.email) {
      try {
        const waybillDisplay = waybill || shipment_id;
        const orderLink = `${process.env.APP_URL || 'https://joyory.com/'}order-details/${shipment_id}`;
        const shipmentItems = shipment.products.map(item =>
          `• ${item.name || 'Product'} (Qty: ${item.quantity})`
        ).join('\n');

        const emailContent = {
          to: order.user.email,
          subject: `Shipment Cancelled - Order #${orderId.substring(0, 8)}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #f8f9fa; padding: 20px; border-radius: 8px; }
                .content { margin: 20px 0; }
                .info-box { background: #f1f8ff; border-left: 4px solid #007bff; padding: 15px; margin: 15px 0; }
                .status-badge { 
                  background: #dc3545; 
                  color: white; 
                  padding: 4px 12px; 
                  border-radius: 20px; 
                  display: inline-block; 
                  font-size: 14px;
                }
                .footer { 
                  margin-top: 30px; 
                  padding-top: 20px; 
                  border-top: 1px solid #eee; 
                  color: #666; 
                  font-size: 14px;
                }
                .button {
                  display: inline-block;
                  padding: 10px 20px;
                  background: #007bff;
                  color: white;
                  text-decoration: none;
                  border-radius: 5px;
                  margin: 10px 0;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h2>Shipment Cancellation Confirmation</h2>
                  <p>Hi ${order.user.name || 'Customer'},</p>
                </div>
                
                <div class="content">
                  <p>Your shipment has been successfully cancelled. Here are the details:</p>
                  
                  <div class="info-box">
                    <p><strong>Order ID:</strong> ${orderId}</p>
                    <p><strong>Shipment ID:</strong> ${shipment_id}</p>
                    <p><strong>Waybill Number:</strong> ${waybillDisplay}</p>
                    <p><strong>Status:</strong> <span class="status-badge">CANCELLED</span></p>
                    <p><strong>Cancellation Reason:</strong> ${reason}</p>
                    <p><strong>Cancelled On:</strong> ${new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
                  </div>
                  
                  <h3>📦 Cancelled Items</h3>
                  <pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${shipmentItems}</pre>
                  
                  <h3>💰 Refund Information</h3>
                  <p>If you've paid for this shipment, your refund will be processed within 5-7 business days. The amount will be credited to your original payment method.</p>
                  
                  <h3>📋 Next Steps</h3>
                  <ul>
                    <li>Your order status is now: <strong>${derivedOrderStatus}</strong></li>
                    <li>Check your refund status in your account</li>
                    <li>Contact support if you need to modify other shipments</li>
                  </ul>
                  
                  <a href="${orderLink}" class="button">View Order Details</a>
                </div>
                
                <div class="footer">
                  <p>Need help? <a href="mailto:support@joyory.com">Contact our support team</a></p>
                  <p>This is an automated email, please do not reply directly.</p>
                  <p>Thank you for shopping with Joyory!</p>
                  <p><strong>— Team Joyory</strong></p>
                </div>
              </div>
            </body>
            </html>
          `,
          // Optional text version for email clients that don't support HTML
          text: `
            SHIPMENT CANCELLATION CONFIRMATION
            
            Hi ${order.user.name || 'Customer'},
            
            Your shipment has been successfully cancelled.
            
            Order ID: ${orderId}
            Shipment ID: ${shipment_id}
            Waybill Number: ${waybillDisplay}
            Status: CANCELLED
            Cancellation Reason: ${reason}
            Cancelled On: ${new Date().toLocaleDateString('en-IN')}
            
            Cancelled Items:
            ${shipmentItems}
            
            Refund Information:
            If you've paid for this shipment, your refund will be processed within 5-7 business days.
            
            Order Status: ${derivedOrderStatus}
            
            View your order: ${orderLink}
            
            Need help? Contact support@joyory.com
            
            Thank you for shopping with Joyory!
            — Team Joyory
          `
        };

        // Send email in background without blocking response
        sendEmail(emailContent).catch(error => {
          console.warn("📧 Email sending failed (non-critical):", error.message);
          // Log to monitoring service if available
          // e.g., logToSentry(error, { orderId, shipment_id, userId });
        });

      } catch (emailError) {
        console.warn("📧 Email preparation failed:", emailError.message);
        // Don't fail the whole request if email fails
      }
    }


    return res.json({
      success: true,
      message: "Shipment cancelled successfully"
    });

  } catch (err) {
    console.error("CANCEL SHIPMENT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  } finally {
    await session.endSession();
  }
};

export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};
    const userId = req.user?._id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required"
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required"
      });
    }

    const order = await Order.findById(orderId).populate("user");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // 🔐 Ownership check
    if (String(order.user._id) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "This is not your order"
      });
    }

    await session.withTransaction(async () => {
      const txOrder = await Order.findById(orderId)
        .session(session)
        .populate("products.productId");

      if (!txOrder) throw new Error("Order missing in transaction");

      /* --------------------------------
         🔁 SHIPMENT VALIDATION + CANCEL
      -------------------------------- */
      const nonCancelableShipmentStates = [
        "Picked Up",
        "In Transit",
        "Out for Delivery",
        "Delivered"
      ];

      if (Array.isArray(txOrder.shipments)) {
        for (const shipment of txOrder.shipments) {

          // Idempotent
          if (shipment.status === "Cancelled") continue;

          // 🚫 Block if shipment already moving
          if (nonCancelableShipmentStates.includes(shipment.status)) {
            throw new Error(
              "Order cannot be cancelled because shipment is already in transit"
            );
          }

          // 🚚 Cancel at Delhivery
          if (shipment.provider === "delhivery" && shipment.waybill) {
            await cancelDelhiveryShipment(shipment.waybill);
          }

          // 📦 Update shipment locally
          shipment.status = "Cancelled";
          shipment.tracking_history.push({
            status: "Cancelled",
            timestamp: new Date(),
            location: "Customer",
            description: reason
          });
        }
      }

      /* --------------------------------
         🔁 STOCK ROLLBACK (ONLY IF CONFIRMED)
      -------------------------------- */
      if (txOrder.adminConfirmed) {
        for (const item of txOrder.products) {
          const product = await Product.findById(item.productId._id)
            .session(session);

          if (!product) continue;

          const qty = Number(item.quantity || 0);

          const variant = item.variant?.sku
            ? product.variants.find(v => v.sku === item.variant.sku)
            : null;

          if (variant) {
            variant.stock += qty;
            variant.sales = Math.max(0, (variant.sales || 0) - qty);
          }

          product.sales = Math.max(0, (product.sales || 0) - qty);
          product.quantity = product.variants.reduce(
            (sum, v) => sum + v.stock,
            0
          );

          await product.save({ session });
        }
      }

      /* --------------------------------
         📦 ORDER STATE (DERIVED)
      -------------------------------- */
      txOrder.cancellation = {
        cancelledBy: userId,
        reason,
        requestedAt: new Date(),
        allowed: true
      };

      txOrder.orderStatus = computeOrderStatus(txOrder.shipments);

      await txOrder.save({ session });
    });

    // 📧 EMAIL (non-blocking)
    sendEmail(
      order.user.email,
      "Your Joyory Order Has Been Cancelled",
      `
              <p>Hi ${order.user.name},</p>
              <p>Your order has been cancelled successfully.</p>
              <p><strong>Reason:</strong> ${reason}</p>
              ${order.paid ? "<p>Your refund will be processed shortly.</p>" : ""}
              <p>— Team Joyory</p>
            `
    ).catch(console.warn);

    return res.status(200).json({
      success: true,
      message: order.paid
        ? "Order cancelled. Refund will be processed."
        : "Order cancelled successfully"
    });

  } catch (err) {
    console.error("❌ USER CANCEL ERROR:", err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  } finally {
    await session.endSession();
  }
};

