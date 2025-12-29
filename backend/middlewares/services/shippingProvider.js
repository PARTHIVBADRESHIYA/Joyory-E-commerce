// // services/shippingProvider.js
// import { createMockShipment, getMockTracking, advanceMockShipment } from "./mockShipping.js";
// import { createShiprocketOrder } from "./shiprocket.js"; // your existing file

// const PROVIDER = (process.env.SHIPPING_PROVIDER || "mock").toLowerCase();

// /**
//  * Create a shipment (provider-agnostic)
//  * Returns: { shipmentDetails, rawResponses? }
//  */
// export async function createShipment(order) {
//     if (PROVIDER === "shiprocket") {
//         return createShiprocketOrder(order);
//     }
//     return createMockShipment(order);
// }

// /**
//  * Get tracking by shipment id (mock only).
//  * Real provider would call their tracking API; for now we read from mock store.
//  */
// export async function getTracking(shipmentId) {
//     if (PROVIDER === "shiprocket") {
//         // In real life you’d call Shiprocket's tracking API here.
//         // For now just return null to keep codepaths clean.
//         return null;
//     }
//     return getMockTracking(shipmentId);
// }

// /** Move a mock shipment forward one step (for testing) */
// export async function advanceShipment(shipmentId) {
//     if (PROVIDER === "shiprocket") {
//         throw new Error("advanceShipment is mock-only");
//     }
//     return advanceMockShipment(shipmentId);
// }
