import Order from '../models/Order.js';
import User from '../models/User.js';
import Product from "../models/Product.js";
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js'; // ✅ Correct import
dayjs.extend(isBetween);

export const getAnalyticsDashboard = async (req, res) => {
    try {
        const { range = "1m" } = req.query;

        // --- Date ranges ---
        const now = dayjs();
        const ranges = {
            "1d": { start: now.startOf("day"), end: now.endOf("day") },
            "7d": { start: now.subtract(7, "day").startOf("day"), end: now.endOf("day") },
            "1m": { start: now.subtract(1, "month").startOf("day"), end: now.endOf("day") },
            "1y": { start: now.subtract(1, "year").startOf("day"), end: now.endOf("day") },
            "5y": { start: now.subtract(5, "year").startOf("day"), end: now.endOf("day") },
        };
        const { start: currentStart, end: currentEnd } = ranges[range] || ranges["1m"];
        const periodDuration = currentEnd.diff(currentStart);
        const previousStart = currentStart.subtract(periodDuration, "ms");
        const previousEnd = currentStart.subtract(1, "ms");

        // --- Fetch all orders at once (only last 5y max for performance if needed) ---
        const allOrders = await Order.find()
            .populate({ path: "products.productId", populate: { path: "category", select: "name" } })
            .populate("user")
            .lean();

        // --- Split orders into current & previous periods ---
        const currentOrders = [];
        const previousOrders = [];

        allOrders.forEach(o => {
            const created = dayjs(o.createdAt);
            if (created.isBetween(currentStart, currentEnd, null, '[]')) currentOrders.push(o);
            else if (created.isBetween(previousStart, previousEnd, null, '[]')) previousOrders.push(o);
        });

        // --- Fetch all products for stock & top searches ---
        const products = await Product.find().populate("category", "name").lean();

        // --- Professional growth/trend calculation ---
        const calcProfessionalGrowth = (current, previous = 0) => {
            let changePercent = 0, trend = "neutral";
            if (previous > 0) {
                changePercent = ((current - previous) / previous) * 100;
                trend = current > previous ? "up" : current < previous ? "down" : "neutral";
            } else if (current > 0) {
                changePercent = 100; trend = "up";
            }
            return { value: current, changePercent: Number(changePercent.toFixed(1)), trend };
        };

        // --- Summary Metrics ---
        const totalOrders = currentOrders.length;
        const completedOrders = currentOrders.filter(o => ["Delivered", "Completed"].includes(o.status)).length;
        const returnOrders = currentOrders.filter(o => ["Cancelled", "Returned"].includes(o.status)).length;
        const activeOrders = totalOrders - completedOrders - returnOrders;
        const totalRevenue = currentOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

        const prevTotalOrders = previousOrders.length;
        const prevCompletedOrders = previousOrders.filter(o => ["Delivered", "Completed"].includes(o.status)).length;
        const prevReturnOrders = previousOrders.filter(o => ["Cancelled", "Returned"].includes(o.status)).length;
        const prevActiveOrders = prevTotalOrders - prevCompletedOrders - prevReturnOrders;
        const prevTotalRevenue = previousOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

        const summary = {
            totalOrders: calcProfessionalGrowth(totalOrders, prevTotalOrders),
            completedOrders: calcProfessionalGrowth(completedOrders, prevCompletedOrders),
            activeOrders: calcProfessionalGrowth(activeOrders, prevActiveOrders),
            returnOrders: calcProfessionalGrowth(returnOrders, prevReturnOrders),
            totalRevenue: calcProfessionalGrowth(totalRevenue, prevTotalRevenue),
        };

        // --- Sales Trends ---
        const monthlyRevenueMap = {};
        allOrders.forEach(o => {
            const month = dayjs(o.createdAt).format("YYYY-MM");
            monthlyRevenueMap[month] = (monthlyRevenueMap[month] || 0) + (o.amount || 0);
        });
        const salesTrends = Object.entries(monthlyRevenueMap)
            .map(([month, revenue]) => ({ month, revenue }))
            .sort((a, b) => a.month.localeCompare(b.month));

        // --- Stock Alerts ---
        const stockAlerts = [];
        products.forEach(p => {
            if (p.quantity <= 5) stockAlerts.push({ name: p.name, stock: p.quantity, price: p.price });
            p.variants?.forEach(v => {
                if (v.stock <= (v.thresholdValue || 5)) {
                    stockAlerts.push({
                        name: `${p.name} (${v.shadeName || "Variant"})`,
                        stock: v.stock,
                        price: v.discountedPrice || p.discountedPrice || p.price,
                    });
                }
            });
        });

        // --- Recent Orders ---
        const recentOrders = currentOrders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 6)
            .map(o => ({
                productName: o.products?.[0]?.productId?.name || "N/A",
                orderId: o.orderId,
                date: dayjs(o.createdAt).format("MMM D, YYYY"),
                customerName: o.customerName || o.user?.name || "Guest",
                status: o.status,
                paymentMode: o.orderType,
                amount: o.amount,
            }));

        // --- Top Searches ---
        const topSearches = [...products]
            .sort((a, b) => (b.sales || 0) - (a.sales || 0))
            .slice(0, 3)
            .map((p, i) => {
                const price = p.variants?.[0]?.discountedPrice || p.discountedPrice || p.price;
                return { rank: i + 1, name: p.name, price };
            });

        // --- Category Trends ---
        const categoryStats = {};
        allOrders.forEach(order => {
            order.products.forEach(item => {
                const product = item.productId;
                if (!product || !product.category) return;
                const catName = product.category.name || "Unknown";
                if (!categoryStats[catName]) categoryStats[catName] = { sales: 0, revenue: 0 };
                categoryStats[catName].sales += item.quantity || 1;
                const soldPrice = item.variant?.discountedPrice || item.price || product.discountedPrice || product.price || 0;
                categoryStats[catName].revenue += soldPrice * (item.quantity || 1);
            });
        });

        const categoryTrends = Object.entries(categoryStats)
            .map(([categoryName, stats]) => ({ category: categoryName, sales: stats.sales, revenue: stats.revenue }))
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 5);

        res.status(200).json({ summary, salesTrends, stockAlerts, recentOrders, topSearches, categoryTrends });

    } catch (error) {
        console.error("🔥 Dashboard Error:", error);
        res.status(500).json({ success: false, message: "Failed to load admin dashboard", error: error.message });
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

    const total = excellent + good + poor || 1;

    return {
        excellent: Math.round((excellent / total) * 100),
        good: Math.round((good / total) * 100),
        poor: Math.round((poor / total) * 100),
    };
};
