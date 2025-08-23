// middlewares/cache.js
import NodeCache from 'node-cache';

// Create cache with TTL: 10 mins (600 seconds)
export const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
