
import express from "express";
import {
    createPaymentMethod,
    getAllPaymentMethods,
    updatePaymentMethod,
    togglePaymentMethod,
    deletePaymentMethod,
} from "../../../controllers/settings/payments/paymentMethodController.js";

const router = express.Router();

// Example: all these should be protected with adminAuth middleware
router.post("/", createPaymentMethod);
router.get("/", getAllPaymentMethods);
router.put("/:id", updatePaymentMethod);
router.patch("/:id/toggle", togglePaymentMethod);
router.delete("/:id", deletePaymentMethod);

export default router;

