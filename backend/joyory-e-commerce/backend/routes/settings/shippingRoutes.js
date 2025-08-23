import express from 'express';
import {
  createShippingMethod,
  getAllShippingMethods,
  updateShippingMethod,
  deleteShippingMethod
} from '../../controllers/settings/shippingController.js';

const router = express.Router();

// POST /api/settings/shipping
router.post('/', createShippingMethod);

// GET /api/settings/shipping
router.get('/', getAllShippingMethods);

// PUT /api/settings/shipping/:id
router.put('/:id', updateShippingMethod);

// DELETE /api/settings/shipping/:id
router.delete('/:id', deleteShippingMethod);

export default router;
