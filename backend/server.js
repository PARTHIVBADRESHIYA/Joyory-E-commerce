import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import http from 'http'; // ✅ NEW
import { Server } from 'socket.io'; // ✅ NEW

import connectDB from './config/db.js';
// Load environment variables
import cron from 'node-cron';
import { autoSendScheduledCampaigns } from './middlewares/utils/cron/autoSendCampaigns.js';


import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import productRoutes from './routes/productRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import discountRoutes from './routes/discountRoutes.js';
import promotionRoutes from './routes/promotionRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import affiliateRoutes from './routes/affiliateRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import commentRoutes from './routes/commentRoutes.js';


import storeSettingRoutes from './routes/settings/storeSettingRoutes.js';
import shippingRoutes from './routes/settings/shippingRoutes.js';
import paymentRoutes from './routes/settings/payments/paymentRoutes.js';
import paymentMethodRoutes from './routes/settings/payments/paymentMethodRoutes.js';

import teamRoutes from './routes/settings/admin/teamRoutes.js';
import adminRoleRoutes from './routes/settings/admin/adminRoleRoutes.js';
import adminRoleAdminController from './routes/settings/admin/adminRoleAdmin.js';

import notificationRoutes from './routes/settings/admin/notificationRoutes.js';
import securityRoutes from './routes/settings/admin/securityRoutes.js';

import attributeRoutes from './routes/attributeRoutes.js';

import testRoutes from "./routes/testRoutes.js";


//user side backend

import userProductRoutes from "./routes/user/userProductRoutes.js";
import userCartAndOrderRoutes from "./routes/user/userCartAndOrderRoutes.js";
import userAddressRoutes from "./routes/user/userAddressRoutes.js";


// Connect to MongoDB
connectDB();

// Initialize Express
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());


cron.schedule('*/10 * * * *', autoSendScheduledCampaigns); // runs every 10 mins

// ✅ SETUP SOCKET.IO
// ============================
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*', // Replace with frontend origin in production
        methods: ['GET', 'POST']
    }
});

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// ✅ Export io to use in controllers
export { io };


// Use Auth Routes
app.use('/api/auth', authRoutes);

// Use User Routes
app.use('/api/users', userRoutes);
app.use("/api/admin", authRoutes);

app.use('/api', productRoutes);

app.use('/api/attributes', attributeRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);

//discount
app.use('/api/discounts', discountRoutes);

//promotion
app.use('/api/promotions', promotionRoutes);

//review
app.use('/api/reviews', reviewRoutes);

//analytics
app.use('/api/analytics', analyticsRoutes);

//affiliate
app.use('/api/affiliates', affiliateRoutes);

//blog
app.use('/api/blogs', blogRoutes);

//support
app.use('/api/support', supportRoutes);

//marketing
app.use('/api/campaign', campaignRoutes);

//settings
app.use('/api/store', storeSettingRoutes);
app.use('/api/shipping', shippingRoutes);

//payment
app.use('/api/payment', paymentRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);

//admin
//admin role admin
app.use('/api/admin-role-admin', adminRoleAdminController);

app.use('/api/admin/roles', adminRoleRoutes);
app.use('/api/admin/teams', teamRoutes);

//notification
app.use('/api/notifications', notificationRoutes);

//security
app.use('/api/security', securityRoutes);

//comments
app.use('/api/comments', commentRoutes);


app.use("/api", testRoutes);



//user side backend

app.use('/api/user/products', userProductRoutes);

app.use('/api/user/cart', userCartAndOrderRoutes);

app.use('/api/user/address', userAddressRoutes);






// Example route
// app.get('/', (req, res) => {
//     res.send('API is running...');
// });

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
