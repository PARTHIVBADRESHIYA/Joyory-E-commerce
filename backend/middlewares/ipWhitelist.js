// middlewares/ipWhitelist.js
import dotenv from 'dotenv';
dotenv.config();

// ✅ Define this helper function before using it
const normalizeIP = ip => ip?.replace(/^::ffff:/, '').trim();

export const ipWhitelistMiddleware = (req, res, next) => {
    const rawIP =
        req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip;

    const ip = normalizeIP(rawIP); // Use after it's defined

    const allowedIPs = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()) || [];

    if (allowedIPs.includes(ip)) {
        return next();
    }
    return res.status(404).send('Not Found');

};
