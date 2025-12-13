// routes/shipmentReturnRoutes.js
import express from "express";
import {
    requestShipmentReturn,
    getMyShipmentReturns,
    getShipmentReturnDetails,
    cancelShipmentReturn,
    markShipmentReturnReceived,
    approveShipmentReturn,
    rejectShipmentReturn,
    getAllReturnsForAdmin,
    getReturnsSummary,
    getReturnDetails,
    getReturnsAnalytics,

} from "../controllers/returnController.js";

import { protect, isAdmin } from "../middlewares/authMiddleware.js";
import { uploadRefund } from "../middlewares/upload.js";

const router = express.Router();

/*
|---------------------------------------------------------------------------
| USER ROUTES
|---------------------------------------------------------------------------
*/

// ⭐ User requests a shipment return
// Images are uploaded as images_<productId> → dynamic keys
router.post(
    "/request/:shipment_id",
    protect,
    uploadRefund.any(),
    requestShipmentReturn
);

// List user's own shipment returns
router.get("/my", protect, getMyShipmentReturns);

// Get shipment return details
router.get("/details/:shipment_id/:returnId", protect, getShipmentReturnDetails);

// Cancel shipment return
router.put("/cancel/:shipment_id/:returnId", protect, cancelShipmentReturn);


/*
|---------------------------------------------------------------------------
| ADMIN ROUTES
|---------------------------------------------------------------------------
*/

// ⭐ Admin approves shipment return & creates Shiprocket return order

router.get(
    "/admin/summary",
    protect,
    isAdmin,
    getReturnsSummary
),
router.get(
    "/admin/analytics",
    protect,
    isAdmin,
    getReturnsAnalytics
),
router.get(
    "/admin/details/:returnId",
    protect,
    isAdmin,
    getReturnDetails
)




router.get(
    "/admin/returns",
    protect,
    isAdmin,
    getAllReturnsForAdmin
)
router.put(
    "/admin/approve/:shipment_id/:returnId",
    protect,
    isAdmin,
    approveShipmentReturn
);

// ❌ Admin rejects shipment return
router.put(
    "/admin/reject/:shipment_id/:returnId",
    protect,
    isAdmin,
    rejectShipmentReturn
);

// Mark shipment return received and trigger refund
router.put(
    "/admin/mark-received/:shipment_id/:returnId",
    protect,
    isAdmin,
    markShipmentReturnReceived
);

/*
|---------------------------------------------------------------------------
| EXPORT ROUTER
|---------------------------------------------------------------------------
*/
export default router;
