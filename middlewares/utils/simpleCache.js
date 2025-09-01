// utils/simpleCache.js
const cache = new Map();

/**
 * Save data in cache with TTL
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs - Time-to-live in ms
 */
export function setCache(key, value, ttlMs = 30000) {
    cache.set(key, {
        value,
        expiry: Date.now() + ttlMs
    });
}

/**
 * Get data if valid, otherwise null
 * @param {string} key
 */
export function getCache(key) {
    const item = cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
    }

    return item.value;
}

export function clearCache(key) {
    cache.delete(key);
}
    