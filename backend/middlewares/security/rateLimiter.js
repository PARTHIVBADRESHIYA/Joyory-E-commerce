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

export const productListRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Allow 30 requests per minute
    message: 'Too many product listing requests. Please slow down.',
});

// For `/api/user/products/:id` - single product detail
export const productDetailRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60, // Allow 60 requests per minute
    message: 'Too many product detail requests. Please slow down.',
});