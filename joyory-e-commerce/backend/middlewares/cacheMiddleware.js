// middlewares/cacheMiddleware.js
import { cache } from "./cache.js";

export const cacheMiddleware = (req, res, next) => {
    const key = `${req.originalUrl}`; // 🔑 Safer than JSON.stringify(req.query)

    const cachedData = cache.get(key);
    if (cachedData) {
        console.log("📦 Serving from cache:", key);
        return res.json(cachedData);
    }

    // Override res.json to store response in cache
    res.sendResponse = res.json;
    res.json = (body) => {
        cache.set(key, body, 300); // ⏳ Cache for 5 min
        res.sendResponse(body);
    };

    next();
};
