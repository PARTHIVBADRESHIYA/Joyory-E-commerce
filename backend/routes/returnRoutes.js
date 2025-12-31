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
    "/request/:shipmentId",
    protect,
    uploadRefund.any(),
    requestShipmentReturn
);

// List user's own shipment returns
router.get("/my", protect, getMyShipmentReturns);

// Get shipment return details
router.get("/details/:shipmentId/:returnId", protect, getShipmentReturnDetails);

// Cancel shipment return
router.put("/cancel/:shipmentId/:returnId", protect, cancelShipmentReturn);


/*
|---------------------------------------------------------------------------
| ADMIN ROUTES
|---------------------------------------------------------------------------
*/

// ⭐ Admin approves shipment return & creates Shiprocket return order

router.get(
    "/admin/summary", isAdmin,
    getReturnsSummary
),
    router.get(
        "/admin/analytics", isAdmin,
        getReturnsAnalytics
    ),
    router.get(
        "/admin/details/:returnId",
        isAdmin,
        getReturnDetails
    )

router.put(
    "/admin/approve/:shipmentId/:returnId",
    isAdmin,
    approveShipmentReturn
);

// ❌ Admin rejects shipment return 
router.put(
    "/admin/reject/:shipmentId/:returnId",
    isAdmin,
    rejectShipmentReturn
);

// Mark shipment return received and trigger refund
router.put(
    "/admin/mark-received/:shipmentId/:returnId",
    isAdmin,
    markShipmentReturnReceived
);

/*
|---------------------------------------------------------------------------
| EXPORT ROUTER
|---------------------------------------------------------------------------
*/
export default router;
