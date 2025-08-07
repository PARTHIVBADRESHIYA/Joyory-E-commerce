// middlewares/security/rateLimiter.js
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// ⛔ 10 attempts per 15 mins per IP
export const teamMemberLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max requests per windowMs
    message: 'Too many login attempts. Please try again after 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});

export const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max requests per windowMs
    message: 'Too many login attempts. Please try again after 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});

export const adminRoleAdminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max requests per windowMs
    message: 'Too many login attempts. Please try again after 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});

export const userLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max requests per windowMs
    message: 'Too many login attempts. Please try again after 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});


export const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many OTP requests. Please try again later.'
    },
    keyGenerator: (req) => {
        // ✅ Safe fallback to ipKeyGenerator instead of raw req.ip
        return req.body.email?.toLowerCase() || ipKeyGenerator(req);
    }
});