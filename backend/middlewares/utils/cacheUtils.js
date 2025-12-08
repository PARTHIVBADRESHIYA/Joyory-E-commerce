// src/middlewares/utils/cacheUtils.js
import { getRedis } from '../../middlewares/utils/redis.js'; // adjust path

// Bump this when you change API response shape
export const PRODUCT_CACHE_VERSION = "v1"; // change to v2, v3 when you add/remove fields

// Pattern used in user-side caching: prod:<version>:<idOrSlug>:<variant?>
const makeProductKeyPattern = (productIdOrSlug = "*", variant = "*") =>
    `prod:${PRODUCT_CACHE_VERSION}:${productIdOrSlug}:${variant}`;

// Production-safe deletion using SCAN (non-blocking)
async function scanDel(pattern) {
    const redis = getRedis();   // 🔥 FIX ADDED
    if (!redis) return;
    try {
        const stream = redis.scanStream({ match: pattern, count: 500 });
        const pipeline = redis.pipeline();
        const keysToDel = [];
        await new Promise((resolve, reject) => {
            stream.on("data", (keys = []) => {
                for (const key of keys) {
                    keysToDel.push(key);
                    pipeline.del(key);
                }
            });
            stream.on("end", async () => {
                if (keysToDel.length) await pipeline.exec();
                resolve();
            });
            stream.on("error", (err) => reject(err));
        });
        return keysToDel.length;
    } catch (err) {
        console.error("scanDel error:", err);
        // fallback to KEYS if SCAN fails (dev only)
        try {
            const keys = await redis.keys(pattern);
            if (keys.length) await redis.del(keys);
            return keys.length;
        } catch (e) {
            console.error("fallback delete error:", e);
            return 0;
        }
    }
}

export const clearProductCacheForId = async (productIdOrSlug) => {
    const redis = getRedis();   // 🔥 FIX ADDED
    if (!redis) return 0;
    const pattern = makeProductKeyPattern(productIdOrSlug, "*");
    return await scanDel(pattern);
};

export const clearAllProductCaches = async () => {
    const redis = getRedis();   // 🔥 FIX ADDED
    if (!redis) return 0;
    // delete any product related keys across versions
    const pattern = `prod:*:*:*`;
    return await scanDel(pattern);
};
