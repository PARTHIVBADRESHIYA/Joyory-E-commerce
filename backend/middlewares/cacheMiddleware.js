// middlewares/cacheMiddleware.js
import { cache } from "./cache.js";

export const cacheMiddleware = (req, res, next) => {
    const key = `${req.originalUrl}`;

    const cachedData = cache.get(key);
    if (cachedData) {
        console.log("📦 Serving from cache:", key);
        return res.json(cachedData);
    }

    // Wrap res.json
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        cache.set(key, body, 300);
        return originalJson(body);
    };

    // Wrap res.send (for routes that use send instead of json)
    const originalSend = res.send.bind(res);
    res.send = (body) => {
        try {
            const parsed = JSON.parse(body);
            cache.set(key, parsed, 300);
        } catch {
            // body not JSON → skip caching
        }
        return originalSend(body);
    };
    
    console.log("❌ Cache miss, waiting for controller:", key);

    next();
};

