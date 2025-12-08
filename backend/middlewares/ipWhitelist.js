// middlewares/ipWhitelist.js
import "../config/env.js";


// ✅ Define this helper function before using it
const normalizeIP = ip => ip?.replace(/^::ffff:/, '').trim();

export const ipWhitelistMiddleware = (req, res, next) => {
    const rawIP =
        (req.headers['x-forwarded-for']?.split(',')[0]) ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip;

    const clientIP = normalizeIP(rawIP);

    const allowedList = process.env.ALLOWED_IPS?.split(',').map(i => i.trim()) || [];

    // Allow partial (range) and exact matches
    const isAllowed = allowedList.some(allowedIP => clientIP === allowedIP || clientIP.startsWith(allowedIP));
    
    if (isAllowed) return next();

    return res.status(404).send('Not Found');
};
