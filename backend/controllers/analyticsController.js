import Order from '../models/Order.js';
import User from '../models/User.js';
import Review from '../models/Review.js';
import dayjs from 'dayjs';
import Product from "../models/Product.js";

export const getAnalyticsDashboard = async (req, res) => {
    try {
        // 🔹 Fetch necessary data
        const orders = await Order.find().populate("user").populate("products.productId").lean();
        const products = await Product.find().populate("category", "name").lean();
        const users = await User.find().lean();

        // 🕒 Define time ranges
        const now = dayjs();
        const lastWeekStart = now.subtract(7, "day");
        const prevWeekStart = now.subtract(14, "day");

        // Helper for simple growth
        const calcSimpleGrowth = (current, previous) => {
            if (previous === 0 && current === 0) return { value: current, changePercent: 0, trend: "neutral" };
            if (previous === 0) return { value: current, changePercent: 100, trend: "up" };
            const change = ((current - previous) / previous) * 100;
            return {
                value: current,
                changePercent: Number(change.toFixed(1)),
                trend: change > 0 ? "up" : change < 0 ? "down" : "neutral"
            };
        };

        // --- 1. Summary metrics (last 7 days vs previous 7 days) ---
        const getOrdersCount = (statusArr, start, end) =>
            orders.filter(o => statusArr.includes(o.status) && dayjs(o.createdAt).isAfter(start) && dayjs(o.createdAt).isBefore(end)).length;

        const getRevenue = (start, end) =>
            orders.filter(o => dayjs(o.createdAt).isAfter(start) && dayjs(o.createdAt).isBefore(end))
                  .reduce((sum, o) => sum + (o.amount || 0), 0);

        const getUsersCount = (start, end) =>
            users.filter(u => dayjs(u.createdAt).isAfter(start) && dayjs(u.createdAt).isBefore(end)).length;

        const lastWeekOrders = orders.filter(o => dayjs(o.createdAt).isAfter(lastWeekStart)).length;
        const prevWeekOrders = orders.filter(o => dayjs(o.createdAt).isAfter(prevWeekStart) && dayjs(o.createdAt).isBefore(lastWeekStart)).length;

        const lastWeekCompleted = getOrdersCount(["Delivered", "Completed"], lastWeekStart, now);
        const prevWeekCompleted = getOrdersCount(["Delivered", "Completed"], prevWeekStart, lastWeekStart);

        const lastWeekActive = getOrdersCount(["Pending", "Processing", "Shipped"], lastWeekStart, now);
        const prevWeekActive = getOrdersCount(["Pending", "Processing", "Shipped"], prevWeekStart, lastWeekStart);

        const lastWeekReturns = getOrdersCount(["Cancelled"], lastWeekStart, now);
        const prevWeekReturns = getOrdersCount(["Cancelled"], prevWeekStart, lastWeekStart);

        const lastWeekRevenue = getRevenue(lastWeekStart, now);
        const prevWeekRevenue = getRevenue(prevWeekStart, lastWeekStart);

        // Calculate growth for summary
        const summary = {
            totalOrders: calcSimpleGrowth(lastWeekOrders, prevWeekOrders),
            completedOrders: calcSimpleGrowth(lastWeekCompleted, prevWeekCompleted),
            activeOrders: calcSimpleGrowth(lastWeekActive, prevWeekActive),
            returnOrders: calcSimpleGrowth(lastWeekReturns, prevWeekReturns),
            totalRevenue: calcSimpleGrowth(lastWeekRevenue, prevWeekRevenue)
        };

        // --- 2. Sales Trends ---
        const monthlyRevenueMap = {};
        orders.forEach(o => {
            const month = dayjs(o.createdAt).format("YYYY-MM");
            monthlyRevenueMap[month] = (monthlyRevenueMap[month] || 0) + (o.amount || 0);
        });

        const salesTrends = Object.entries(monthlyRevenueMap)
            .map(([month, revenue]) => ({ month, revenue }))
            .sort((a, b) => a.month.localeCompare(b.month));

        // --- 3. Stock Alerts ---
        const stockAlerts = [];
        products.forEach(p => {
            if (p.quantity <= 5) {
                stockAlerts.push({ name: p.name, stock: p.quantity, price: p.price });
            }
            p.variants?.forEach(v => {
                if (v.stock <= (v.thresholdValue || 5)) {
                    stockAlerts.push({
                        name: `${p.name} (${v.shadeName || "Variant"})`,
                        stock: v.stock,
                        price: v.discountedPrice || p.discountedPrice || p.price
                    });
                }
            });
        });

        // --- 4. Recent Orders ---
        const recentOrders = orders
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 6)
            .map(o => ({
                productName: o.products?.[0]?.productId?.name || "N/A",
                orderId: o.orderId,
                date: dayjs(o.createdAt).format("MMM D, YYYY"),
                customerName: o.customerName || o.user?.name || "Guest",
                status: o.status,
                paymentMode: o.orderType,
                amount: o.amount
            }));

        // --- 5. Top Products ---
        const topSearches = [...products]
            .sort((a, b) => (b.sales || 0) - (a.sales || 0))
            .slice(0, 3)
            .map((p, i) => ({ rank: i + 1, name: p.name, price: p.discountedPrice || p.price }));

        // --- 6. Category Trends ---
        const categoryStats = {};
        products.forEach(p => {
            if (!p.category) return;
            const catName = p.category.name || "Unknown";
            if (!categoryStats[catName]) categoryStats[catName] = { sales: 0, revenue: 0 };
            categoryStats[catName].sales += p.sales || 0;
            categoryStats[catName].revenue += (p.sales || 0) * (p.sellingPrice || 0);
        });

        const categoryTrends = Object.entries(categoryStats)
            .map(([categoryName, stats]) => ({ category: categoryName, sales: stats.sales, revenue: stats.revenue }))
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 5);

        // ✅ Final Dashboard Response
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
