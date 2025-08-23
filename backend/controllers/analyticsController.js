import Order from '../models/Order.js';
import User from '../models/User.js';
import Review from '../models/Review.js';
import dayjs from 'dayjs';
import Affiliate from '../models/Affiliate.js';
import Product from "../models/Product.js";

export const getAnalyticsDashboard = async (req, res) => {
    try {
        const orders = await Order.find({
            status: { $in: ["Delivered", "Completed"] }
        }).populate("products.productId").populate("promotionUsed.promotionId");

        const products = await Product.find();
        const users = await User.find();
        const affiliates = await Affiliate.find().populate('generatedLinks.product');

        // 📌 Totals
        let totalRevenue = 0, totalProfit = 0, totalPurchase = 0, totalSales = 0;
        let totalAffiliatePayout = 0;

        for (const order of orders) {
            totalRevenue += order.amount;

            for (const item of order.products) {
                const product = item.productId;
                if (!product) continue;

                const cost = product.buyingPrice * item.quantity;
                const revenue = item.price * item.quantity;

                let commission = 0;
                if (order.affiliate) {
                    const affiliate = await Affiliate.findById(order.affiliate);
                    commission = order.amount * (affiliate?.commissionRate || 0.15);
                    totalAffiliatePayout += commission;
                }

                totalProfit += (revenue - cost - commission);
                totalPurchase += cost;
                totalSales += revenue;
            }
        }


        const avgOrderValue = totalRevenue / (orders.length || 1);
        const totalCustomers = new Set(orders.map(o => o.user?.toString())).size;

        // 🔁 Repeat Customer Rate
        const customerOrderMap = {};
        orders.forEach(o => {
            const uid = o.user?.toString();
            if (uid) customerOrderMap[uid] = (customerOrderMap[uid] || 0) + 1;
        });
        const repeatCustomers = Object.values(customerOrderMap).filter(c => c > 1).length;
        const repeatCustomerRate = ((repeatCustomers / totalCustomers) * 100).toFixed(2);

        // 🏆 Best-Selling Products
        const bestSellers = products
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 5)
            .map(p => ({
                title: p.title,
                productId: p.productID || p._id,
                category: p.category,
                remaining: `${p.stock || 0} ${p.unit || ''}`,
                turnover: p.sales * p.sellingPrice,
                increaseBy: `${(Math.random() * 3).toFixed(1)}%`
            }));

        // 📦 Best-Selling Categories
        const categoryStats = {};
        products.forEach(p => {
            if (!categoryStats[p.category]) categoryStats[p.category] = { count: 0, turnover: 0 };
            categoryStats[p.category].count += p.sales;
            categoryStats[p.category].turnover += p.sales * p.sellingPrice;
        });
        const topCategories = Object.entries(categoryStats)
            .map(([category, stats]) => ({ category, ...stats, increaseBy: `${(Math.random() * 3).toFixed(1)}%` }))
            .sort((a, b) => b.turnover - a.turnover)
            .slice(0, 5);

        // 📈 Revenue Trends
        const monthlyStats = {};
        orders.forEach(o => {
            const month = new Date(o.createdAt).toISOString().slice(0, 7);
            if (!monthlyStats[month]) monthlyStats[month] = { orders: 0, revenue: 0 };
            monthlyStats[month].orders += 1;
            monthlyStats[month].revenue += o.amount;
        });
        const monthlyTrends = Object.entries(monthlyStats)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, stats]) => ({ month, ...stats }));

        // 💰 Revenue by Channel
        const channelRevenue = { Online: 0, Affiliate: 0, Campaign: 0, Promotion: 0 };

        for (const o of orders) {
            const type = o.orderType || "Online";
            channelRevenue[type] = (channelRevenue[type] || 0) + o.amount;

            if (o.affiliate) {
                channelRevenue.Affiliate += o.amount; // ✅ Add to Affiliate channel
            }

            if (o.promotionUsed?.promotionId) {
                channelRevenue.Promotion += o.amount; // ✅ Existing logic
            }
        }


        // 🤝 Affiliate Conversions
        const topAffiliates = affiliates.flatMap(a => a.generatedLinks.map(link => ({
            product: link.product?.title || "Deleted Product",
            conversions: link.clicks,
            revenue: link.clicks * (link.product?.sellingPrice || 0),
            trend: `${(Math.random() * 5).toFixed(1)}%`
        }))).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

        // 📊 MoM & YoY Profit Logic
        const startOfThisMonth = dayjs().startOf('month').toDate();
        const endOfThisMonth = dayjs().endOf('month').toDate();
        const startOfLastMonth = dayjs().subtract(1, 'month').startOf('month').toDate();
        const endOfLastMonth = dayjs().subtract(1, 'month').endOf('month').toDate();

        const startOfThisYear = dayjs().startOf('year').toDate();
        const now = new Date();
        const sameDayLastYear = dayjs().subtract(1, 'year').toDate();
        const startOfLastYear = dayjs().subtract(1, 'year').startOf('year').toDate();

        const thisMonthOrders = await Order.find({
            status: { $in: ["Delivered", "Completed"] },
            createdAt: { $gte: startOfThisMonth, $lte: endOfThisMonth }
        }).populate("products.productId");

        const lastMonthOrders = await Order.find({
            status: { $in: ["Delivered", "Completed"] },
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
        }).populate("products.productId");

        const thisYearOrders = await Order.find({
            status: { $in: ["Delivered", "Completed"] },
            createdAt: { $gte: startOfThisYear, $lte: now }
        }).populate("products.productId");

        const lastYearOrders = await Order.find({
            status: { $in: ["Delivered", "Completed"] },
            createdAt: { $gte: startOfLastYear, $lte: sameDayLastYear }
        }).populate("products.productId");

        const calcProfit = (orders) => {
            let profit = 0;
            orders.forEach(order => {
                order.products.forEach(item => {
                    const product = item.productId;
                    if (product) {
                        const cost = product.buyingPrice * item.quantity;
                        const revenue = item.price * item.quantity;
                        profit += (revenue - cost);
                    }
                });
            });
            return profit;
        };

        const momProfit = calcProfit(lastMonthOrders) > 0
            ? +(((calcProfit(thisMonthOrders) - calcProfit(lastMonthOrders)) / calcProfit(lastMonthOrders)) * 100).toFixed(2)
            : calcProfit(thisMonthOrders) > 0 ? 100 : 0;

        const yoyProfit = calcProfit(lastYearOrders) > 0
            ? +(((calcProfit(thisYearOrders) - calcProfit(lastYearOrders)) / calcProfit(lastYearOrders)) * 100).toFixed(2)
            : calcProfit(thisYearOrders) > 0 ? 100 : 0;

        res.status(200).json({
            totals: {
                totalProfit,
                totalRevenue,
                totalSales,
                totalPurchase,
                avgOrderValue,
                totalOrders: orders.length,
                totalCustomers,
                repeatCustomerRate,
                totalAffiliatePayout,
                momProfit,
                yoyProfit
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

    const total = excellent + good + poor || 1;

    return {
        excellent: Math.round((excellent / total) * 100),
        good: Math.round((good / total) * 100),
        poor: Math.round((poor / total) * 100),
    };
};
