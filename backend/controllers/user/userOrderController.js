import express from "express";
import mongoose from "mongoose";
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';    
import User from '../../models/User.js';
import { calculateCartSummary } from "../../middlewares/utils/cartPricingHelper.js";
import axios from "axios";
import { getShiprocketToken, createShiprocketOrder } from "../../middlewares/services/shiprocket.js"; // helper to fetch token
import { sendEmail } from "../../middlewares/utils/emailService.js";
import { cancelShiprocketShipment } from "../../middlewares/services/shiprocket.js";

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
          shipment_id: String(s.shipment_id),
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
      shippingDiscount = order.shippingCharge || 0;
    }

    const additionalDiscounts = {
      shippingDiscount,
      message: shippingDiscount > 0 ? "Free delivery on orders above ₹499" : null
    };

    // ------------------------------------------------------------------
    // GST CALCULATION (FROM ORDER SCHEMA)
    // ------------------------------------------------------------------
    const gstDetails = {
      rate: order.gst?.rate || 0,                   // e.g., 12%
      taxableAmount: order.gst?.taxableAmount || sellingPriceTotal,
      gstAmount: order.gst?.amount || ((sellingPriceTotal * (order.gst?.rate || 0)) / 100),
      totalWithGST: (sellingPriceTotal || 0) + ((sellingPriceTotal * (order.gst?.rate || 0)) / 100)
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
        additionalDiscounts,
        gst: gstDetails
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

export const cancelShipment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { orderId, shipment_id } = req.params;
    const { reason } = req.body || {};
    const userId = req.user._id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required"
      });
    }
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);

      if (!order) throw new Error("Order not found");

      const shipment = order.shipments.id(shipment_id);
      if (!shipment) throw new Error("Shipment not found");

      // ❌ Cannot cancel shipped shipments
      const blockedStatuses = ["In Transit", "Out for Delivery", "Delivered"];
      if (blockedStatuses.includes(shipment.status))
        throw new Error(
          `Shipment cannot be cancelled because it is already ${shipment.status}`
        );

      // 🚚 Cancel in Shiprocket
      if (shipment.shiprocket_order_id) {
        await cancelShiprocketShipment(shipment.shiprocket_order_id);
      }

      // ✅ Update shipment
      shipment.status = "Cancelled";
      shipment.tracking_history.push({
        status: "Cancelled",
        timestamp: new Date(),
        description: "Shipment cancelled by user"
      });

      // 🧮 Recalculate order status
      const statuses = order.shipments.map(s => s.status);

      if (statuses.every(s => s === "Cancelled")) {
        order.orderStatus = "Cancelled";
      } else if (statuses.some(s => s === "Cancelled")) {
        order.orderStatus = "Partially Cancelled";
      }

      order.cancellation = {
        cancelledBy: userId,
        reason,
        requestedAt: new Date(),
        allowed: true
      };

      await order.save({ session });
    });

    res.json({
      success: true,
      message: "Shipment cancelled successfully"
    });

  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};
    const userId = req.user?._id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required"
      });
    }


    if (!orderId)
      return res.status(400).json({ success: false, message: "orderId is required" });

    const order = await Order.findById(orderId)
      .populate("user")
      .session(session);

    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    // 🔐 Ownership check
    if (String(order.user._id) !== String(userId) && !req.user?.isAdmin)
      return res.status(403).json({ success: false, message: "This is not your order" });

    // ❌ Already cancelled
    if (order.orderStatus === "Cancelled")
      return res.status(400).json({ success: false, message: "Order already cancelled" });

    // 🚫 If shipments already created → block
    if (order.shipments && order.shipments.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled because shipment has already been created."
      });
    }

    await session.withTransaction(async () => {
      order.orderStatus = "Cancelled";
      order.paymentStatus = order.paid ? "refund_requested" : "cancelled";

      order.cancellation = {
        cancelledBy: userId,
        reason,
        requestedAt: new Date(),
        allowed: true,
      };

      order.tracking_history = order.tracking_history || [];
      order.tracking_history.push({
        status: "Order Cancelled",
        timestamp: new Date(),
        location: "Customer",
      });

      await order.save({ session });
    });

    // ✉️ EMAIL
    try {
      await sendEmail(
        order.user.email,
        "Your Joyory Order Has Been Cancelled",
        `
          <p>Hi ${order.user.name},</p>
          <p>Your order <strong>#${order._id}</strong> has been cancelled successfully.</p>
          <p><strong>Reason:</strong> ${reason || "Not specified"}</p>
          ${order.paid
          ? "<p>Your refund will be processed shortly.</p>"
          : ""
        }
          <p>Thank you,<br/>Team Joyory</p>
        `
      );
    } catch (err) {
      console.error("Email failed:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: order.paid
        ? "Order cancelled. Refund will be processed."
        : "Order cancelled successfully",
    });

  } catch (err) {
    console.error("❌ Cancel order error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Cancel order failed",
    });
  } finally {
    await session.endSession();
  }
};

// export const cancelOrder = async (req, res) => {
//   const session = await mongoose.startSession();
//   try {
//     const { orderId, reason } = req.body;
//     const userId = req.user?._id;

//     if (!orderId)
//       return res.status(400).json({ success: false, message: "orderId is required" });

//     const order = await Order.findById(orderId)
//       .populate("products.productId")
//       .populate("user");

//     if (!order)
//       return res.status(404).json({ success: false, message: "Order not found" });

//     // ensure owner
//     if (String(order.user._id) !== String(userId) && !req.user?.isAdmin)
//       return res.status(403).json({ success: false, message: "Unauthorized" });

//     // prevent duplicate cancellation
//     if (order.orderStatus === "Cancelled")
//       return res.status(400).json({ success: false, message: "Order already cancelled" });

//     // cannot cancel after shipping
//     const nonCancelableStatuses = ["Shipped", "Out for Delivery", "Delivered"];
//     if (nonCancelableStatuses.includes(order.orderStatus))
//       return res.status(400).json({
//         success: false,
//         message: `Order cannot be cancelled once ${order.orderStatus}`
//       });

//     await session.withTransaction(async () => {
//       const txOrder = await Order.findById(orderId)
//         .session(session)
//         .populate("products.productId");

//       if (!txOrder) throw new Error("Order disappeared during transaction");

//       // ⭐⭐⭐ REVERSE STOCK & SALES — only if admin confirmed ⭐⭐⭐
//       if (txOrder.adminConfirmed) {
//         for (const item of txOrder.products) {
//           const product = await Product.findById(item.productId._id).session(session);
//           if (!product) continue;

//           const qty = Number(item.quantity || 0);

//           if (item.variant?.sku) {
//             const variantIndex = product.variants.findIndex(v => v.sku === item.variant.sku);
//             if (variantIndex !== -1) {
//               const variant = product.variants[variantIndex];

//               // restore stock
//               variant.stock += qty;

//               // reduce sales
//               variant.sales = Math.max(0, (variant.sales || 0) - qty);
//             }
//           } else {
//             product.quantity += qty;
//           }

//           // restore product-wide sales
//           product.sales = Math.max(0, (product.sales || 0) - qty);

//           // update total stock if variants exist
//           if (product.variants?.length > 0) {
//             product.quantity = product.variants.reduce(
//               (s, v) => s + (Number(v.stock) || 0),
//               0
//             );
//           }

//           // status update
//           if (product.quantity <= 0) product.status = "Out of stock";
//           else if (product.thresholdValue != null && product.quantity < product.thresholdValue)
//             product.status = "Low stock";
//           else product.status = "In-stock";

//           await product.save({ session });
//         }
//       }

//       // cancel in shiprocket
//       if (txOrder.shipment?.shiprocket_order_id) {
//         try {
//           await cancelShiprocketShipment(txOrder.shipment.shiprocket_order_id);
//         } catch (err) {
//           console.error("Shiprocket cancel failed:", err?.response?.data || err.message);
//         }
//       }

//       txOrder.orderStatus = "Cancelled";
//       txOrder.paymentStatus = txOrder.paid ? "refund_requested" : "cancelled";

//       txOrder.cancellation = {
//         cancelledBy: userId,
//         reason,
//         requestedAt: new Date(),
//         allowed: true,
//       };

//       // refund setup
//       if (txOrder.paid) {
//         txOrder.refund = {
//           amount: txOrder.amount,
//           method: null,
//           status: "requested",
//           reason,
//           requestedBy: userId,
//           refundAudit: [
//             {
//               status: "requested",
//               changedBy: userId,
//               changedByModel: "User",
//               note: "Refund requested automatically after cancellation",
//             },
//           ],
//         };
//       }

//       await txOrder.save({ session });
//     });

//     const refundMethodsAvailable = order.paid
//       ? [
//         { method: "razorpay", label: "Original Payment Method" },
//         { method: "wallet", label: "Joyory Wallet" },
//       ]
//       : [];

//     // -----------------------------------------------
//     // 📩 SEND EMAIL TO USER — SAME STYLE AS GIFT CARD
//     // -----------------------------------------------
//     try {
//       await sendEmail(
//         order.user.email,
//         "Your Joyory Order Has Been Cancelled",
//         `
//                 <p>Hi ${order.user.name},</p>
//                 <p>Your order <strong>#${order._id}</strong> has been successfully cancelled.</p>
//                 <p><strong>Reason:</strong> ${reason || "Not specified"}</p>
//                 ${order.paid
//           ? `<p>A refund request has been created. Please select your preferred refund method in your Joyory dashboard.</p>`
//           : `<p>Since this order was unpaid, no refund is required.</p>`
//         }
//                 <p>Thank you,<br/>Team Joyory</p>
//             `
//       );
//     } catch (emailErr) {
//       console.error("Email sending failed:", emailErr.message);
//     }
//     // -------------------------------------------------

//     return res.status(200).json({
//       success: true,
//       message: order.paid
//         ? "Order cancelled. Refund initiated — choose refund method."
//         : "Order cancelled successfully.",
//       refundMethodsAvailable,
//     });
//   } catch (err) {
//     console.error("❌ Cancel order error:", err);
//     res.status(500).json({ success: false, message: "Cancel order failed" });
//   } finally {
//     await session.endSession();
//   }
// };