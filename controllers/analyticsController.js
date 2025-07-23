import Order from '../models/Order.js';
import User from '../models/User.js';
import Review from '../models/Review.js';
import dayjs from 'dayjs';

import Product from "../models/Product.js";

export const getAnalyticsDashboard = async (req, res) => {
    try {
        const orders = await Order.find({ status: "Delivered" }).populate("products.productId");
        const products = await Product.find();
        const users = await User.find();
        const affiliates = await AffiliateActivity.find().populate("product");

        // Total Revenue, Profit, Orders
        let totalRevenue = 0;
        let totalProfit = 0;
        orders.forEach(order => {
            totalRevenue += order.amount;
            order.products.forEach(item => {
                const product = products.find(p => p._id.equals(item.productId));
                if (product) {
                    const cost = product.buyingPrice * item.quantity;
                    const revenue = item.price * item.quantity;
                    totalProfit += (revenue - cost);
                }
            });
        });

        // Average Order Value
        const avgOrderValue = totalRevenue / (orders.length || 1);

        // Total Customers
        const totalCustomers = new Set(orders.map(o => o.user?.toString())).size;

        // Repeat Customer Rate
        const customerOrderMap = {};
        orders.forEach(o => {
            const uid = o.user?.toString();
            if (uid) {
                customerOrderMap[uid] = (customerOrderMap[uid] || 0) + 1;
            }
        });
        const repeatCustomers = Object.values(customerOrderMap).filter(c => c > 1).length;
        const repeatCustomerRate = ((repeatCustomers / totalCustomers) * 100).toFixed(2);

        // Best-Selling Products
        const bestSellers = [...products]
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 5)
            .map(p => ({
                title: p.title,
                sales: p.sales,
                revenue: p.sales * p.sellingPrice
            }));

        // Top Categories
        const categoryStats = {};
        products.forEach(p => {
            if (!categoryStats[p.category]) {
                categoryStats[p.category] = { count: 0, turnover: 0 };
            }
            categoryStats[p.category].count += p.sales;
            categoryStats[p.category].turnover += p.sales * p.sellingPrice;
        });

        const topCategories = Object.entries(categoryStats)
            .map(([category, stats]) => ({
                category,
                ...stats
            }))
            .sort((a, b) => b.turnover - a.turnover)
            .slice(0, 5);

        // Affiliate Conversions
        const topAffiliates = affiliates
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)
            .map(a => ({
                product: a.product?.title || "Deleted Product",
                conversions: a.conversions,
                revenue: a.revenue,
                trend: a.trend
            }));

        // Revenue & Order Trends (Last 6 Months)
        const monthlyStats = {};
        orders.forEach(o => {
            const month = new Date(o.createdAt).toISOString().slice(0, 7); // "2025-07"
            if (!monthlyStats[month]) {
                monthlyStats[month] = { orders: 0, revenue: 0 };
            }
            monthlyStats[month].orders += 1;
            monthlyStats[month].revenue += o.amount;
        });

        const monthlyTrends = Object.entries(monthlyStats)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, stats]) => ({
                month,
                ...stats
            }));

        // Revenue by Channel (Online, Affiliate, Campaign)
        const channelRevenue = {
            Online: 0,
            Affiliate: 0,
            Campaign: 0
        };
        orders.forEach(o => {
            const type = o.orderType || "Online";
            channelRevenue[type] = (channelRevenue[type] || 0) + o.amount;
        });

        res.status(200).json({
            totals: {
                totalRevenue,
                totalProfit,
                totalOrders: orders.length,
                avgOrderValue,
                totalCustomers,
                repeatCustomerRate
            },
            bestSellers,
            topCategories,
            topAffiliates,
            monthlyTrends,
            channelRevenue
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Analytics fetch failed",
            error: err.message
        });
    }
};

export const getCustomerVolumeAnalytics = async () => {
    const totalCustomers = await User.countDocuments();

    const thirtyDaysAgo = dayjs().subtract(30, 'day').toDate();

    const newCustomers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    const oldCustomers = totalCustomers - newCustomers;
    
    const newCustomerPercentage = totalCustomers > 0 ? Math.round((newCustomers / totalCustomers) * 100) : 0;
    const oldCustomerPercentage = totalCustomers > 0 ? 100 - newCustomerPercentage : 0;

    return {
        totalCustomers,
        newCustomers,
        oldCustomers,
        newCustomerPercentage,
        oldCustomerPercentage,
    };
};
export const getCustomerBehaviorAnalytics = async () => {
    const allReviews = await Review.find({});

    let excellent = 0;
    let good = 0;
    let poor = 0;

    allReviews.forEach((review) => {
        const rating = review.rating;

        if (rating >= 4.5) {
            excellent++;
        } else if (rating >= 3.0) {
            good++;
        } else {
            poor++;
        }
    });

    const total = excellent + good + poor || 1; // avoid division by zero

    return {
        excellent: Math.round((excellent / total) * 100),
        good: Math.round((good / total) * 100),
        poor: Math.round((poor / total) * 100),
    };
};
