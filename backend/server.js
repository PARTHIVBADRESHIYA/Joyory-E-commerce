// import dotenv from 'dotenv';
// dotenv.config();
// import express from 'express';
// import cors from 'cors';
// import http from 'http'; // ✅ NEW
// import { Server } from 'socket.io'; // ✅ NEW

// import connectDB from './config/db.js';
// // Load environment variables
// import cron from 'node-cron';

// import { autoSendScheduledCampaigns } from './middlewares/utils/cron/autoSendCampaigns.js';


// import authRoutes from './routes/authRoutes.js';
// import userRoutes from './routes/user/userRoutes.js';
// import productRoutes from './routes/productRoutes.js';
// import adminCategoryRoutes from './routes/categoryRoutes.js';
// import inventoryRoutes from './routes/inventoryRoutes.js';
// import orderRoutes from './routes/orderRoutes.js';
// import discountRoutes from './routes/discountRoutes.js';
// import promotionRoutes from './routes/promotionRoutes.js';
// import reviewRoutes from './routes/reviewRoutes.js';
// import analyticsRoutes from './routes/analyticsRoutes.js';
// import affiliateRoutes from './routes/affiliateRoutes.js';
// import blogRoutes from './routes/blogRoutes.js';
// import supportRoutes from './routes/supportRoutes.js';
// import campaignRoutes from './routes/campaignRoutes.js';
// import commentRoutes from './routes/commentRoutes.js';


// import storeSettingRoutes from './routes/settings/storeSettingRoutes.js';
// import shippingRoutes from './routes/settings/shippingRoutes.js';
// import paymentRoutes from './routes/settings/payments/paymentRoutes.js';
// import paymentMethodRoutes from './routes/settings/payments/paymentMethodRoutes.js';

// import teamRoutes from './routes/settings/admin/teamRoutes.js';
// import adminRoleRoutes from './routes/settings/admin/adminRoleRoutes.js';
// import adminRoleAdminController from './routes/settings/admin/adminRoleAdmin.js';

// import notificationRoutes from './routes/settings/admin/notificationRoutes.js';
// import securityRoutes from './routes/settings/admin/securityRoutes.js';

// import attributeRoutes from './routes/attributeRoutes.js';

// import testRoutes from "./routes/testRoutes.js";

// // import { securityMiddleware } from './middlewares/security.js';


// //user side backend

// import userProductRoutes from "./routes/user/userProductRoutes.js";
// import userCartAndOrderRoutes from "./routes/user/userCartAndOrderRoutes.js";
// import userAddressRoutes from "./routes/user/userAddressRoutes.js";
// import userCategoryRoutes from "./routes/user/userCategoryRoutes.js";
// import recommendationRoutes from "./routes/user/recommendationRoutes.js";
// import userProfileRoutes from "./routes/user/profile/userProfileRoutes.js";

// // Connect to MongoDB
// connectDB();

// // Initialize Express
// const app = express();
// // securityMiddleware(app);

// app.set('trust proxy', 1); // ✅ trust only first proxy (like Render)


// // Middlewares
// app.use(cors());
// app.use(express.json());


// cron.schedule('*/10 * * * *', autoSendScheduledCampaigns); // runs every 10 mins

// // ✅ SETUP SOCKET.IO
// // ============================
// const server = http.createServer(app);

// const io = new Server(server, {
//     cors: {
//         origin: '*', // Replace with frontend origin in production
//         methods: ['GET', 'POST']
//     }
// });

// io.on('connection', (socket) => {
//     console.log('🔌 Client connected:', socket.id);

//     socket.on('disconnect', () => {
//         console.log('❌ Client disconnected:', socket.id);
//     });
// });

// // ✅ Export io to use in controllers
// export { io };


// // Use Auth Routes

// // Use User Routes
// app.use('/api/user', userRoutes);
// app.use("/api/admin", authRoutes);

// // Admin category routes (protected with admin auth if you have it)
// app.use('/api/admin/categories', adminCategoryRoutes);
// app.use('/api', productRoutes);



// app.use('/api/attributes', attributeRoutes);
// app.use('/api/inventory', inventoryRoutes);
// app.use('/api/orders', orderRoutes);

// //discount
// app.use('/api/discounts', discountRoutes);

// //promotion
// app.use('/api/promotions', promotionRoutes);

// //review
// app.use('/api/reviews', reviewRoutes);

// //analytics
// app.use('/api/analytics', analyticsRoutes);

// //affiliate
// app.use('/api/affiliates', affiliateRoutes);

// //blog
// app.use('/api/blogs', blogRoutes);

// //support
// app.use('/api/support', supportRoutes);

// //marketing
// app.use('/api/campaign', campaignRoutes);

// //settings
// app.use('/api/store', storeSettingRoutes);
// app.use('/api/shipping', shippingRoutes);

// //payment
// app.use('/api/payment', paymentRoutes);
// app.use('/api/payment-methods', paymentMethodRoutes);

// //admin
// //admin role admin
// app.use('/api/admin-role-admin', adminRoleAdminController);

// app.use('/api/admin/roles', adminRoleRoutes);
// app.use('/api/admin/teams', teamRoutes);

// //notification
// app.use('/api/notifications', notificationRoutes);

// //security
// app.use('/api/security', securityRoutes);

// //comments
// app.use('/api/comments', commentRoutes);


// app.use("/api", testRoutes);



// //user side backend

// // Public / user-facing category routes (category tree, get by slug, get products)
// app.use('/api/user/products', userProductRoutes);
// app.use('/api/user/categories', userCategoryRoutes);

// app.use('/api/user/cart', userCartAndOrderRoutes);

// app.use('/api/user/address', userAddressRoutes);

// app.use('/api/user/recommendations', recommendationRoutes);

// app.use('/api/user/profile', userProfileRoutes);





// // Example route
// app.get('/', (req, res) => {  
//     res.send('API is running...');
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//     console.log(`✅ Server running on port ${PORT}`);
// });



// import dotenv from 'dotenv';
// dotenv.config();
// import express from 'express';
// import cors from 'cors';
// import http from 'http';
// import { Server } from 'socket.io';
// import bodyParser from 'body-parser';

// import connectDB from './config/db.js';
// import cron from 'node-cron';
// import { autoSendScheduledCampaigns } from './middlewares/utils/cron/autoSendCampaigns.js';
// import { startTrackingJob } from "./middlewares/utils/cron/shiprocketTrackingJob.js";

// // Routes
// import authRoutes from './routes/authRoutes.js';
// import userRoutes from './routes/user/userRoutes.js';
// import productRoutes from './routes/productRoutes.js';
// import adminCategoryRoutes from './routes/categoryRoutes.js';
// import inventoryRoutes from './routes/inventoryRoutes.js';
// import orderRoutes from './routes/orderRoutes.js';
// import discountRoutes from './routes/discountRoutes.js';
// import promotionRoutes from './routes/promotionRoutes.js';
// import reviewRoutes from './routes/reviewRoutes.js';
// import analyticsRoutes from './routes/analyticsRoutes.js';
// import affiliateRoutes from './routes/affiliateRoutes.js';
// import blogRoutes from './routes/blogRoutes.js';
// import supportRoutes from './routes/supportRoutes.js';
// import campaignRoutes from './routes/campaignRoutes.js';
// import commentRoutes from './routes/commentRoutes.js';

// import storeSettingRoutes from './routes/settings/storeSettingRoutes.js';
// import shippingRoutes from './routes/settings/shippingRoutes.js';
// import paymentRoutes from './routes/settings/payments/paymentRoutes.js';
// import paymentMethodRoutes from './routes/settings/payments/paymentMethodRoutes.js';
// import webhookRoutes from "./routes/webhookRoutes.js";

// import teamRoutes from './routes/settings/admin/teamRoutes.js';
// import adminRoleRoutes from './routes/settings/admin/adminRoleRoutes.js';
// import adminRoleAdminController from './routes/settings/admin/adminRoleAdmin.js';

// import notificationRoutes from './routes/settings/admin/notificationRoutes.js';
// import securityRoutes from './routes/settings/admin/securityRoutes.js';
// import attributeRoutes from './routes/attributeRoutes.js';
// import testRoutes from './routes/testRoutes.js';
// import videoRoutes from './routes/videoRoutes.js';
// import brandRoutes from './routes/brandRoutes.js';

// // User side
// import userProductRoutes from './routes/user/userProductRoutes.js';
// import userCartAndOrderRoutes from './routes/user/userCartAndOrderRoutes.js';
// import userCategoryRoutes from './routes/user/userCategoryRoutes.js';
// import recommendationRoutes from './routes/user/recommendationRoutes.js';
// import userProfileRoutes from './routes/user/profile/userProfileRoutes.js';
// import userPromotionRoutes from './routes/user/userPromotionRoutes.js';
// import userVideoRoutes from './routes/user/userVideoRoutes.js';
// import userBrandRoutes from './routes/user/userBrandRoutes.js';
// import userDiscountRoutes from './routes/user/userDiscountRoutes.js';

// // Connect to MongoDB
// connectDB();


// const app = express();
// app.set('trust proxy', 1);

// // 🔹 Webhook: Razorpay requires RAW body
// app.use(
//     "/api/webhooks/razorpay",
//     bodyParser.raw({ type: "application/json" })
// );

// // 🔹 Other middlewares
// app.use(cors());
// app.use(express.json());

// // 🔹 Cron jobs
// function initializeCronJobs() {
//     startTrackingJob();
//     cron.schedule('*/10 * * * *', autoSendScheduledCampaigns);
// }

// initializeCronJobs();


// // 🔹 Socket.IO setup
// const server = http.createServer(app);
// const io = new Server(server, {
//     cors: {
//         origin: '*', // change to frontend domain in production
//         methods: ['GET', 'POST']
//     }
// });

// io.on("connection", (socket) => {
//     console.log("🔌 Client connected:", socket.id);

//     // ✅ Frontend registers the userId after login
//     socket.on("registerUser", (userId) => {
//         socket.join(userId); // user joins a room = userId
//         console.log(`👤 User ${userId} joined room`);
//     });

//     socket.on("disconnect", () => {
//         console.log("❌ Client disconnected:", socket.id);
//     });
// });

// export { io };

// // ========== ROUTES ==========

// // Admin / Auth
// app.use('/api/user', userRoutes);
// app.use('/api/admin', authRoutes);

// app.use('/api/admin/categories', adminCategoryRoutes);
// app.use('/api', productRoutes);
// app.use('/api/attributes', attributeRoutes);
// app.use('/api/inventory', inventoryRoutes);
// app.use('/api/orders', orderRoutes);
// app.use('/api/discounts', discountRoutes);
// app.use('/api/promotions', promotionRoutes);
// app.use('/api/reviews', reviewRoutes);
// app.use('/api/analytics', analyticsRoutes);
// app.use('/api/affiliates', affiliateRoutes);
// app.use('/api/blogs', blogRoutes);
// app.use('/api/support', supportRoutes);
// app.use('/api/campaign', campaignRoutes);
// app.use('/api/videos', videoRoutes);

// // Settings
// app.use('/api/store', storeSettingRoutes);
// app.use('/api/shipping', shippingRoutes);
// app.use('/api/payment', paymentRoutes);
// app.use('/api/payment-methods', paymentMethodRoutes);

// // Admin team/roles
// app.use('/api/admin-role-admin', adminRoleAdminController);
// app.use('/api/admin/roles', adminRoleRoutes);
// app.use('/api/admin/teams', teamRoutes);
// app.use('/api/notifications', notificationRoutes);
// app.use('/api/security', securityRoutes);
// app.use('/api/comments', commentRoutes);

// app.use('/api', testRoutes);

// // 🔹 Webhooks (Razorpay + Shiprocket)
// app.use("/api/webhooks", webhookRoutes);

// // 🔹 Brands
// app.use('/api/brands', brandRoutes);

// // User side
// app.use('/api/user/products', userProductRoutes);
// app.use('/api/user/categories', userCategoryRoutes);
// app.use('/api/user/cart', userCartAndOrderRoutes);
// app.use('/api/user/recommendations', recommendationRoutes);
// app.use('/api/user/profile', userProfileRoutes);
// app.use('/api/user/promotions', userPromotionRoutes);
// app.use('/api/user/videos', userVideoRoutes);
// app.use('/api/user/brands', userBrandRoutes);
// app.use('/api/user/discounts', userDiscountRoutes);

// // Example route
// app.get('/', (req, res) => {
//     res.send('API is running...');
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//     console.log(`✅ Server running on port ${PORT}`);
// });

















// import dotenv from 'dotenv';
// dotenv.config();
// import express from 'express';
// import timeout from "connect-timeout";
// import cors from 'cors';
// import http from 'http';
// import { Server } from 'socket.io';
// import bodyParser from 'body-parser';

// import connectDB from './config/db.js';
// import cron from 'node-cron';
// import { autoSendScheduledCampaigns } from './middlewares/utils/cron/autoSendCampaigns.js';
// import { startTrackingJob } from "./middlewares/utils/cron/shiprocketTrackingJob.js";

// // Routes
// import authRoutes from './routes/authRoutes.js';
// import userRoutes from './routes/user/userRoutes.js';
// import productRoutes from './routes/productRoutes.js';
// import adminCategoryRoutes from './routes/categoryRoutes.js';
// import inventoryRoutes from './routes/inventoryRoutes.js';
// import orderRoutes from './routes/orderRoutes.js';
// import discountRoutes from './routes/discountRoutes.js';
// import promotionRoutes from './routes/promotionRoutes.js';
// import reviewRoutes from './routes/reviewRoutes.js';
// import analyticsRoutes from './routes/analyticsRoutes.js';
// import affiliateRoutes from './routes/affiliateRoutes.js';
// import blogRoutes from './routes/blogRoutes.js';
// import supportRoutes from './routes/supportRoutes.js';
// import campaignRoutes from './routes/campaignRoutes.js';
// import commentRoutes from './routes/commentRoutes.js';

// import storeSettingRoutes from './routes/settings/storeSettingRoutes.js';
// import shippingRoutes from './routes/settings/shippingRoutes.js';
// import paymentRoutes from './routes/settings/payments/paymentRoutes.js';
// import paymentMethodRoutes from './routes/settings/payments/paymentMethodRoutes.js';
// import webhookRoutes from "./routes/webhookRoutes.js";

// import teamRoutes from './routes/settings/admin/teamRoutes.js';
// import adminRoleRoutes from './routes/settings/admin/adminRoleRoutes.js';
// import adminRoleAdminController from './routes/settings/admin/adminRoleAdmin.js';

// import notificationRoutes from './routes/settings/admin/notificationRoutes.js';
// import securityRoutes from './routes/settings/admin/securityRoutes.js';
// import attributeRoutes from './routes/attributeRoutes.js';
// import testRoutes from './routes/testRoutes.js';
// import videoRoutes from './routes/videoRoutes.js';
// import brandRoutes from './routes/brandRoutes.js';
// import testPickUpRoutes from './routes/testPickUpRoutes.js';
// import mockShippingRoutes from './routes/mockShippingRoutes.js';
// import shadeFinderRoutes from './routes/shadeFinderRoutes.js';
// import skinTypeAdminRoutes from "./routes/skinTypeRoutes.js";



// // User side
// import userProductRoutes from './routes/user/userProductRoutes.js';
// import userCartAndOrderRoutes from './routes/user/userCartAndOrderRoutes.js';
// import userCategoryRoutes from './routes/user/userCategoryRoutes.js';
// import recommendationRoutes from './routes/user/recommendationRoutes.js';
// import userProfileRoutes from './routes/user/profile/userProfileRoutes.js';
// import userPromotionRoutes from './routes/user/userPromotionRoutes.js';
// import userVideoRoutes from './routes/user/userVideoRoutes.js';
// import userBrandRoutes from './routes/user/userBrandRoutes.js';
// import userDiscountRoutes from './routes/user/userDiscountRoutes.js';
// import userShadeFinderRoutes from './routes/user/userShadeFinderRoutes.js';

// // Connect to MongoDB
// connectDB();

// const app = express();
// app.set('trust proxy', 1);


// // 🔹 Webhook: Razorpay requires RAW body
// app.use(
//     "/api/webhooks/razorpay",
//     bodyParser.raw({ type: "application/json" })
// );

// // ================= CORS FIX =================
// const allowedOrigins = [
//     "http://localhost:5173",
//     "http://localhost:5174",       // dev frontend
//     "https://joyory-e-commerce.onrender.com", // backend (for server-to-server)
//     "https://joyory.com"           // prod frontend domain
// ];

// app.use(
//     cors({
//         origin: function (origin, callback) {
//             if (!origin || allowedOrigins.includes(origin)) {
//                 callback(null, true);
//             } else {
//                 callback(new Error("Not allowed by CORS"));
//             }
//         },
//         methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//         allowedHeaders: ["Content-Type", "Authorization"],
//     })
// );

// // Express body parser AFTER webhook
// app.use(express.json());

// // 🔹 Cron jobs
// function initializeCronJobs() {
//     startTrackingJob();
//     cron.schedule('*/10 * * * *', autoSendScheduledCampaigns);
// }
// initializeCronJobs();

// // 🔹 Socket.IO setup
// const server = http.createServer(app);
// const io = new Server(server, {
//     cors: {
//         origin: allowedOrigins,
//         methods: ["GET", "POST"]
//     }
// });

// io.on("connection", (socket) => {
//     console.log("🔌 Client connected:", socket.id);

//     socket.on("registerUser", (userId) => {
//         socket.join(userId);
//         console.log(`👤 User ${userId} joined room`);
//     });

//     socket.on("disconnect", () => {
//         console.log("❌ Client disconnected:", socket.id);
//     });
// });

// export { io };

// // ========== ROUTES ==========

// // Admin / Auth
// app.use('/api/user', userRoutes);
// app.use('/api/admin', authRoutes);

// app.use('/api/admin/categories', adminCategoryRoutes);
// app.use('/api', productRoutes);
// app.use('/api/attributes', attributeRoutes);
// app.use('/api/inventory', inventoryRoutes);
// app.use('/api/orders', orderRoutes);
// app.use('/api/discounts', discountRoutes);
// app.use('/api/promotions', promotionRoutes);
// app.use('/api/reviews', reviewRoutes);
// app.use('/api/analytics', analyticsRoutes);
// app.use('/api/affiliates', affiliateRoutes);
// app.use('/api/blogs', blogRoutes);
// app.use('/api/support', supportRoutes);
// app.use('/api/campaign', campaignRoutes);
// app.use('/api/videos', videoRoutes);

// // Settings
// app.use('/api/store', storeSettingRoutes);
// app.use('/api/shipping', shippingRoutes);
// app.use('/api/payment', paymentRoutes);
// app.use('/api/payment-methods', paymentMethodRoutes);

// // Admin team/roles
// app.use('/api/admin-role-admin', adminRoleAdminController);
// app.use('/api/admin/roles', adminRoleRoutes);
// app.use('/api/admin/teams', teamRoutes);
// app.use('/api/notifications', notificationRoutes);
// app.use('/api/security', securityRoutes);
// app.use('/api/comments', commentRoutes);

// app.use('/api', testRoutes);

// app.use('/api/shadefinder', shadeFinderRoutes);

// app.use('/api/skintypes', skinTypeAdminRoutes);

// // 🔹 Webhooks (Razorpay + Shiprocket)
// app.use("/api/webhooks", webhookRoutes);

// // 🔹 Brands
// app.use('/api/brands', brandRoutes);
// app.use("/api/test", testPickUpRoutes);

// if ((process.env.SHIPPING_PROVIDER || "mock").toLowerCase() === "mock") {
//     app.use("/api/shipping", mockShippingRoutes);
// }



// // User side
// app.use('/api/user/products', userProductRoutes);
// app.use('/api/user/categories', userCategoryRoutes);
// app.use('/api/user/cart', userCartAndOrderRoutes);
// app.use('/api/user/recommendations', recommendationRoutes);
// app.use('/api/user/profile', userProfileRoutes);
// app.use('/api/user/promotions', userPromotionRoutes);
// app.use('/api/user/videos', userVideoRoutes);
// app.use('/api/user/brands', userBrandRoutes);
// app.use('/api/user/discounts', userDiscountRoutes);
// app.use('/api/user/shadefinder', userShadeFinderRoutes);

// // Example route
// app.get('/', (req, res) => {
//     res.send('API is running...');
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//     console.log(`✅ Server running on port ${PORT}`);
// });













// import dotenv from "dotenv";
// dotenv.config();
// import express from "express";
// import cors from "cors";
// import http from "http";
// import { Server } from "socket.io";
// import bodyParser from "body-parser";
// import connectDB from "./config/db.js";
// import cron from "node-cron";
// import { autoSendScheduledCampaigns } from "./middlewares/utils/cron/autoSendCampaigns.js";
// import { startTrackingJob } from "./middlewares/utils/cron/shiprocketTrackingJob.js";

// // 🔹 Routes
// import authRoutes from "./routes/authRoutes.js";
// import userRoutes from "./routes/user/userRoutes.js";
// import productRoutes from "./routes/productRoutes.js";
// import adminCategoryRoutes from "./routes/categoryRoutes.js";
// import inventoryRoutes from "./routes/inventoryRoutes.js";
// import orderRoutes from "./routes/orderRoutes.js";
// import discountRoutes from "./routes/discountRoutes.js";
// import promotionRoutes from "./routes/promotionRoutes.js";
// import reviewRoutes from "./routes/reviewRoutes.js";
// import analyticsRoutes from "./routes/analyticsRoutes.js";
// import affiliateRoutes from "./routes/affiliateRoutes.js";
// import blogRoutes from "./routes/blogRoutes.js";
// import supportRoutes from "./routes/supportRoutes.js";
// import campaignRoutes from "./routes/campaignRoutes.js";
// import commentRoutes from "./routes/commentRoutes.js";
// import storeSettingRoutes from "./routes/settings/storeSettingRoutes.js";
// import shippingRoutes from "./routes/settings/shippingRoutes.js";
// import paymentRoutes from "./routes/settings/payments/paymentRoutes.js";
// import paymentMethodRoutes from "./routes/settings/payments/paymentMethodRoutes.js";
// import webhookRoutes from "./routes/webhookRoutes.js";
// import teamRoutes from "./routes/settings/admin/teamRoutes.js";
// import adminRoleRoutes from "./routes/settings/admin/adminRoleRoutes.js";
// import adminRoleAdminController from "./routes/settings/admin/adminRoleAdmin.js";
// import notificationRoutes from "./routes/settings/admin/notificationRoutes.js";
// import securityRoutes from "./routes/settings/admin/securityRoutes.js";
// import attributeRoutes from "./routes/attributeRoutes.js";
// import testRoutes from "./routes/testRoutes.js";
// import videoRoutes from "./routes/videoRoutes.js";
// import brandRoutes from "./routes/brandRoutes.js";
// import testPickUpRoutes from "./routes/testPickUpRoutes.js";
// import mockShippingRoutes from "./routes/mockShippingRoutes.js";
// import shadeFinderRoutes from "./routes/shadeFinderRoutes.js";
// import skinTypeAdminRoutes from "./routes/skinTypeRoutes.js";
// import giftCardRoutes from "./routes/giftCardTemplateRoutes.js";

// // User side
// import userProductRoutes from "./routes/user/userProductRoutes.js";
// import userCartAndOrderRoutes from "./routes/user/userCartAndOrderRoutes.js";
// import userCategoryRoutes from "./routes/user/userCategoryRoutes.js";
// import recommendationRoutes from "./routes/user/recommendationRoutes.js";
// import userProfileRoutes from "./routes/user/profile/userProfileRoutes.js";
// import userPromotionRoutes from "./routes/user/userPromotionRoutes.js";
// import userVideoRoutes from "./routes/user/userVideoRoutes.js";
// import userBrandRoutes from "./routes/user/userBrandRoutes.js";
// import userDiscountRoutes from "./routes/user/userDiscountRoutes.js";
// import userShadeFinderRoutes from "./routes/user/userShadeFinderRoutes.js";
// import userGiftCardRoutes from "./routes/user/userGiftCardRoutes.js";

// // ================= CONNECT DB =================
// connectDB();

// const app = express();
// app.set("trust proxy", 1);

// // 🔹 Webhook: Razorpay requires RAW body
// app.use("/api/webhooks/razorpay", bodyParser.raw({ type: "application/json" }));

// // ================= CORS =================
// const allowedOrigins = [
//     "http://localhost:5173",
//     "http://localhost:5174",
//     "https://joyory-e-commerce.onrender.com",
//     "https://joyory.com",
// ];

// app.use(
//     cors({
//         origin: (origin, callback) => {
//             if (!origin || allowedOrigins.includes(origin)) {
//                 return callback(null, true);
//             }
//             console.warn("❌ Blocked by CORS:", origin);
//             return callback(new Error("Not allowed by CORS"));
//         },
//         methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//         allowedHeaders: ["Content-Type", "Authorization"],
//     })
// );

// // 🔹 Body Parser AFTER webhook
// app.use(express.json({ limit: "1mb" }));

// // ================= CRON JOBS =================
// function initializeCronJobs() {
//     startTrackingJob();
//     cron.schedule("*/10 * * * *", autoSendScheduledCampaigns);
// }
// initializeCronJobs();

// // ================= SOCKET.IO =================
// const server = http.createServer(app);
// const io = new Server(server, {
//     cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
// });
// io.on("connection", (socket) => {
//     console.log("🔌 Client connected:", socket.id);
//     socket.on("registerUser", (userId) => socket.join(userId));
//     socket.on("disconnect", () => console.log("❌ Client disconnected:", socket.id));
// });
// export { io };

// // ================= ROUTES =================
// app.use("/api/user", userRoutes);
// app.use("/api/admin", authRoutes);
// app.use("/api/admin/categories", adminCategoryRoutes);
// app.use("/api", productRoutes);
// app.use("/api/attributes", attributeRoutes);
// app.use("/api/inventory", inventoryRoutes);
// app.use("/api/orders", orderRoutes);
// app.use("/api/discounts", discountRoutes);
// app.use("/api/promotions", promotionRoutes);
// app.use("/api/reviews", reviewRoutes);
// app.use("/api/analytics", analyticsRoutes);
// app.use("/api/affiliates", affiliateRoutes);
// app.use("/api/blogs", blogRoutes);
// app.use("/api/support", supportRoutes);
// app.use("/api/campaign", campaignRoutes);
// app.use("/api/videos", videoRoutes);
// app.use("/api/store", storeSettingRoutes);
// app.use("/api/shipping", shippingRoutes);
// app.use("/api/payment", paymentRoutes);
// app.use("/api/payment-methods", paymentMethodRoutes);
// app.use("/api/admin-role-admin", adminRoleAdminController);
// app.use("/api/admin/roles", adminRoleRoutes);
// app.use("/api/admin/teams", teamRoutes);
// app.use("/api/notifications", notificationRoutes);
// app.use("/api/security", securityRoutes);
// app.use("/api/comments", commentRoutes);
// app.use("/api", testRoutes);
// app.use("/api/shadefinder", shadeFinderRoutes);
// app.use("/api/giftcards", giftCardRoutes);
// app.use("/api/skintypes", skinTypeAdminRoutes);
// app.use("/api/webhooks", webhookRoutes);
// app.use("/api/brands", brandRoutes);
// app.use("/api/test", testPickUpRoutes);
// if ((process.env.SHIPPING_PROVIDER || "mock").toLowerCase() === "mock") {
//     app.use("/api/shipping", mockShippingRoutes);
// }
// // User side
// app.use("/api/user/products", userProductRoutes);
// app.use("/api/user/categories", userCategoryRoutes);
// app.use("/api/user/cart", userCartAndOrderRoutes);
// app.use("/api/user/recommendations", recommendationRoutes);
// app.use("/api/user/profile", userProfileRoutes);
// app.use("/api/user/promotions", userPromotionRoutes);
// app.use("/api/user/videos", userVideoRoutes);
// app.use("/api/user/brands", userBrandRoutes);
// app.use("/api/user/discounts", userDiscountRoutes);
// app.use("/api/user/shadefinder", userShadeFinderRoutes);
// app.use("/api/user/giftcards", userGiftCardRoutes);

// // ================= TEST ROUTE =================
// app.get("/", (req, res) => res.send("✅ API is running..."));

// // ================= ERROR HANDLER =================
// app.use((err, req, res, next) => {
//     console.error("🔥 Unhandled error:", err);
//     if (res.headersSent) return next(err);
//     res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
// });

// // ================= PROCESS-LEVEL ERROR CATCH =================
// process.on("unhandledRejection", (reason) => {
//     console.error("🚨 Unhandled Rejection:", reason);
// });
// process.on("uncaughtException", (err) => {
//     console.error("🚨 Uncaught Exception:", err);
// });

// // ================= START SERVER =================
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));














import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import bodyParser from "body-parser";
import connectDB from "./config/db.js";
import cron from "node-cron";
import "./middlewares/utils/cron/scheduler.js";
import { autoSendScheduledCampaigns } from "./middlewares/utils/cron/autoSendCampaigns.js";
import { startTrackingJob } from "./middlewares/utils/cron/shiprocketTrackingJob.js";
import "./middlewares/utils/cron/autoPayout.js";

// 🔹 Routes
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/user/userRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import adminCategoryRoutes from "./routes/categoryRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import discountRoutes from "./routes/discountRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import affiliateRoutes from "./routes/affiliateRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import storeSettingRoutes from "./routes/settings/storeSettingRoutes.js";
import shippingRoutes from "./routes/settings/shippingRoutes.js";
import paymentRoutes from "./routes/settings/payments/paymentRoutes.js";
import paymentMethodRoutes from "./routes/settings/payments/paymentMethodRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import teamRoutes from "./routes/settings/admin/teamRoutes.js";
import adminRoleRoutes from "./routes/settings/admin/adminRoleRoutes.js";
import adminRoleAdminController from "./routes/settings/admin/adminRoleAdmin.js";
import notificationRoutes from "./routes/settings/admin/notificationRoutes.js";
import securityRoutes from "./routes/settings/admin/securityRoutes.js";
import attributeRoutes from "./routes/attributeRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import videoRoutes from "./routes/videoRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import testPickUpRoutes from "./routes/testPickUpRoutes.js";
import mockShippingRoutes from "./routes/mockShippingRoutes.js";
import shadeFinderRoutes from "./routes/shadeFinderRoutes.js";
import skinTypeAdminRoutes from "./routes/skinTypeRoutes.js";
import giftCardRoutes from "./routes/giftCardTemplateRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import adminReferralConfigRoutes from "./routes/adminReferralConfigRoutes.js";
import adminWalletRoutes from "./routes/adminWalletRoutes.js";
import sellerRoutes from "./routes/sellerRoutes.js";
import sellerApplicationRoutes from "./routes/sellerApplicationRoutes.js";
import sellerAuthRoutes from "./routes/sellerAuthRoutes.js";

// User side
import userProductRoutes from "./routes/user/userProductRoutes.js";
import userCartAndOrderRoutes from "./routes/user/userCartAndOrderRoutes.js";
import userCategoryRoutes from "./routes/user/userCategoryRoutes.js";
import recommendationRoutes from "./routes/user/recommendationRoutes.js";
import userProfileRoutes from "./routes/user/profile/userProfileRoutes.js";
import userPromotionRoutes from "./routes/user/userPromotionRoutes.js";
import userVideoRoutes from "./routes/user/userVideoRoutes.js";
import userBrandRoutes from "./routes/user/userBrandRoutes.js";
import userDiscountRoutes from "./routes/user/userDiscountRoutes.js";
import userShadeFinderRoutes from "./routes/user/userShadeFinderRoutes.js";
import userGiftCardRoutes from "./routes/user/userGiftCardRoutes.js";
import userWalletRoutes from "./routes/user/userWalletRoutes.js";

// ================= CONNECT DB =================
connectDB();

const app = express();
app.set("trust proxy", 1);

// 🔹 Webhook: Razorpay requires RAW body
app.use("/api/webhooks/razorpay", bodyParser.raw({ type: "application/json" }));

// ================= CORS =================
app.use(
    cors({
        origin: "*", // ✅ Allow all origins
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

// 🔹 Body Parser AFTER webhook
app.use(express.json({ limit: "1mb" }));

// ================= CRON JOBS =================
function initializeCronJobs() {
    startTrackingJob();
    cron.schedule("*/10 * * * *", autoSendScheduledCampaigns);
}
initializeCronJobs();

// ================= SOCKET.IO =================
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }, // ✅ Allow all origins for socket.io
});
io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);
    socket.on("registerUser", (userId) => socket.join(userId));
    socket.on("disconnect", () => console.log("❌ Client disconnected:", socket.id));
});
export { io };

// ================= ROUTES =================
app.use("/api/user", userRoutes);
app.use("/api/admin", authRoutes);
app.use("/api/admin/categories", adminCategoryRoutes);
app.use("/api", productRoutes);
app.use("/api/attributes", attributeRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/affiliates", affiliateRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/campaign", campaignRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/store", storeSettingRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/admin-role-admin", adminRoleAdminController);
app.use("/api/admin/roles", adminRoleRoutes);
app.use("/api/admin/teams", teamRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api", testRoutes);
app.use("/api/shadefinder", shadeFinderRoutes);
app.use("/api/giftcards", giftCardRoutes);
app.use("/api/skintypes", skinTypeAdminRoutes);
app.use("/api/admin-referral-config", adminReferralConfigRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/test", testPickUpRoutes);
app.use("/api/wallet", adminWalletRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/seller-applications", sellerApplicationRoutes);
app.use("/api/seller-auth", sellerAuthRoutes);

if ((process.env.SHIPPING_PROVIDER || "mock").toLowerCase() === "mock") {
    app.use("/api/shipping", mockShippingRoutes);
}

// User side
app.use("/api/user/products", userProductRoutes);
app.use("/api/user/categories", userCategoryRoutes);
app.use("/api/user/cart", userCartAndOrderRoutes);
app.use("/api/user/recommendations", recommendationRoutes);
app.use("/api/user/profile", userProfileRoutes);
app.use("/api/user/promotions", userPromotionRoutes);
app.use("/api/user/videos", userVideoRoutes);
app.use("/api/user/brands", userBrandRoutes);
app.use("/api/user/discounts", userDiscountRoutes);
app.use("/api/user/shadefinder", userShadeFinderRoutes);
app.use("/api/user/giftcards", userGiftCardRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/user/wallet", userWalletRoutes);



app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

// ================= TEST ROUTE =================
app.get("/", (req, res) => res.send("✅ API is running..."));


// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
    console.error("🔥 Unhandled error:", err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

// ================= PROCESS-LEVEL ERROR CATCH =================
process.on("unhandledRejection", (reason) => {
    console.error("🚨 Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("🚨 Uncaught Exception:", err);
});

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
