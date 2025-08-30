// // src/middleware/security.js
// import helmet from "helmet";
// import mongoSanitize from "express-mongo-sanitize";
// import xss from "xss";
// import hpp from "hpp";
// import rateLimit from "express-rate-limit";
// import cookieParser from "cookie-parser";
// import cors from "cors";
// import csrf from "csurf";
// import compression from "compression";
// import dotenv from "dotenv";

// dotenv.config();

// const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";
// const CLOUDINARY_DOMAIN = "res.cloudinary.com";

// export function securityMiddleware(app) {
//     app.disable("x-powered-by");
//     app.use(cookieParser());

//     /** Security headers */      
//     app.use(helmet());
//     app.use(
//         helmet.contentSecurityPolicy({
//             useDefaults: true,
//             directives: {
//                 "default-src": ["'self'"],
//                 "script-src": ["'self'", "'unsafe-inline'", FRONTEND, "https://checkout.razorpay.com"],
//                 "connect-src": ["'self'", FRONTEND, "https://api.razorpay.com"],
//                 "img-src": ["'self'", "data:", FRONTEND, CLOUDINARY_DOMAIN,"https://*"],
//                 "style-src": ["'self'", "'unsafe-inline'", FRONTEND, "https://fonts.googleapis.com"],
//                 "font-src": ["'self'", "https://fonts.gstatic.com"],
//                 "frame-src": ["'self'", "https://checkout.razorpay.com"],
//             },
//         })
//     );

//     if (process.env.NODE_ENV === "production") {
//         app.use(
//             helmet.hsts({
//                 maxAge: 31536000,
//                 includeSubDomains: true,
//                 preload: true,
//             })
//         );
//     }

//     /** Sanitize against NoSQL injection */
//     app.use((req, res, next) => {
//         ["body", "query", "params"].forEach((key) => {
//             if (req[key]) {
//                 for (const prop in req[key]) {
//                     req[key][prop] = mongoSanitize.sanitize(req[key][prop]);
//                 }
//             }
//         });
//         next();
//     });

//     /** Prevent XSS */
//     app.use((req, res, next) => {
//         const sanitizeObject = (obj) => {
//             if (obj && typeof obj === "object") {
//                 for (const key in obj) {
//                     if (typeof obj[key] === "string") {
//                         obj[key] = xss(obj[key]);
//                     } else if (typeof obj[key] === "object") {
//                         sanitizeObject(obj[key]);
//                     }
//                 }
//             }
//         };
//         ["body", "query", "params"].forEach((key) => sanitizeObject(req[key]));
//         next();
//     });

//     app.use(hpp());
//     app.use(compression());

//     /** CORS config */
//     const allowedOrigins = [
//         FRONTEND,
//         "https://joyory.com",
//         "https://admin.joyory.com",
//         "http://localhost:5173",
//     ];
//     if (process.env.NODE_ENV !== "production") {
//         // Development mode — allow any origin that requests
//         app.use(
//             cors({
//                 origin: true, // dynamically reflect origin
//                 credentials: true,
//             })
//         );
//     } else {
//         // Production — restrict to allowedOrigins list
//         app.use(
//             cors({
//                 origin: allowedOrigins,
//                 credentials: true,
//             })
//         );
//     }
//     // app.use(
//     //     cors({
//     //         origin: function (origin, callback) {
//     //             if (!origin || allowedOrigins.includes(origin)) callback(null, true);
//     //             else callback(new Error("Not allowed by CORS"));
//     //         },
//     //         credentials: true,
//     //     })
//     // );

//     /** Rate limiting */
//     app.use(
//         rateLimit({
//             windowMs: 15 * 60 * 1000,
//             max: 200,
//             message: "Too many requests from this IP, try again later.",
//             standardHeaders: true,
//             legacyHeaders: false,
//         })
//     );

//     /** CSRF setup - only enable in production & for non-API routes */
//     if (process.env.NODE_ENV === "production") {
//         const csrfProtection = csrf({
//             cookie: {
//                 httpOnly: true,
//                 secure: true,
//                 sameSite: "strict",
//             },
//         });

//         app.use((req, res, next) => {
//             // Skip CSRF for API calls (JWT auth) or safe HTTP methods
//             if (
//                 req.path.startsWith("/api/") ||
//                 ["GET", "HEAD", "OPTIONS"].includes(req.method)
//             ) {
//                 return next();
//             }
//             return csrfProtection(req, res, next);
//         });

//         // Set CSRF token cookie for browser clients
//         app.use((req, res, next) => {
//             try {
//                 if (!req.path.startsWith("/api/")) {
//                     res.cookie("XSRF-TOKEN", req.csrfToken(), {
//                         httpOnly: false, // readable by frontend JS
//                         secure: true,
//                         sameSite: "strict",
//                     });
//                 }
//             } catch (err) {
//                 // Ignore if no CSRF token is available for this route
//             }
//             next();
//         });
//     } else {
//         console.warn("⚠ CSRF protection disabled in development mode");
//     }

// }

// /** Upload limit middleware */
// export const uploadRateLimiter = rateLimit({
//     windowMs: 60 * 60 * 1000,
//     max: 20,
//     message: "Too many uploads from this IP, try again later.",
//     standardHeaders: true,
//     legacyHeaders: false,
// });

// export function validateUploadMiddleware(opts = {}) {
//     const { maxSizeBytes = 500 * 1024, allowedMime = ['image/jpeg', 'image/png', 'image/webp'] } = opts;
//     return (req, res, next) => {
//         const file = req.file || (req.files && req.files[0]);
//         if (!file) return res.status(400).json({ message: "No file provided." });
//         if (file.size && file.size > maxSizeBytes) {
//             return res.status(413).json({ message: "File too large." });
//         }
//         if (!allowedMime.includes(file.mimetype)) {
//             return res.status(415).json({ message: "Invalid file type." });
//         }
//         if (file.mimetype === 'image/svg+xml') {
//             return res.status(415).json({ message: "SVG uploads are not allowed." });
//         }
//         next();
//     };
// }

// export function scanUploadMiddleware(scannerFn, opts = {}) {
//     return async (req, res, next) => {
//         try {
//             const file = req.file || (req.files && req.files[0]);
//             if (!file || !file.buffer) return res.status(400).json({ message: "No file buffer to scan." });
//             const result = await scannerFn(file.buffer, { filename: file.originalname });
//             if (!result || result.clean !== true) {
//                 return res.status(422).json({ message: "File failed security scan.", detail: result && result.detail });
//             }
//             next();
//         } catch (err) {
//             console.error("scanUploadMiddleware error:", err);
//             return res.status(500).json({ message: "Error scanning file." });
//         }
//     };
// }
