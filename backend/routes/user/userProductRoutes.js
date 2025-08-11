import express from 'express';
import { getAllFilteredProducts, getSingleProduct } from '../../controllers/user/userProductController.js';
import {
    productListRateLimiter,
    productDetailRateLimiter
} from '../../middlewares/security/rateLimiter.js';
import { cache } from '../../middlewares/cache.js';
import { productQuerySchema, productDetailQuerySchema } from '../../middlewares/validations/productQueryValidation.js';
import { validate } from '../../middlewares/validations/validate.js';

const router = express.Router();

// Caching middleware
const cacheMiddleware = (req, res, next) => {
    const key = JSON.stringify(req.query);

    const cachedData = cache.get(key);
    if (cachedData) {
        console.log('📦 Serving from cache:', req.originalUrl); // 🟡 Add this log
        return res.json(cachedData); // ✅ Return from cache
    }

    // Override res.json to store response in cache
    res.sendResponse = res.json;
    res.json = (body) => {
        cache.set(key, body, 300);
        res.sendResponse(body);
    };

    next();
};

router.get('/', productListRateLimiter, cacheMiddleware, validate(productQuerySchema), getAllFilteredProducts); // /api/user/products
router.get('/:id', productDetailRateLimiter, validate(productDetailQuerySchema), getSingleProduct);    // /api/user/products/:id




export default router;
