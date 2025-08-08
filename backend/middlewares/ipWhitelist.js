import dotenv from 'dotenv';
dotenv.config();

const allowedIPs = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()) || [];

export const ipWhitelistMiddleware = (req, res, next) => {
    const ip =
        req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip;

    console.log("Incoming IP:", ip);

    if (allowedIPs.includes(ip)) {
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Access denied: Unauthorized IP',
        yourIP: ip
    });
};
