// routes/seller/dashboard.js
import Product from "../../models/Product.js";
import Seller from "../../models/sellers/Seller.js";
import Category from "../../models/Category.js";
import Order from "../../models/Order.js";
import Review from "../../models/Review.js";

// ================= SELLER DASHBOARD =================

// export const sellerDashboard = async (req, res) => {
//     try {
//         const seller = req.seller;
//         if (!seller) return res.status(401).json({ message: "Unauthorized" });

//         const sellerLicences = seller.licences || [];
//         const licensedCategoryIds = sellerLicences.map(l => l.category.toString());

//         // ---------------- SUMMARY ----------------
//         const totalProducts = await Product.countDocuments({ seller: seller._id });
//         const totalCategories = sellerLicences.length;
//         const orders = await Order.find({ "products.seller": seller._id });
//         const totalOrders = orders.reduce((sum, o) => sum + o.products.filter(p => p.seller.toString() === seller._id.toString()).reduce((s, p) => s + p.quantity, 0), 0);
//         const totalRevenue = orders.reduce((sum, o) => sum + o.products.filter(p => p.seller.toString() === seller._id.toString()).reduce((s, p) => s + p.price * p.quantity, 0), 0);

//         // ---------------- CATEGORY DATA ----------------
//         const categoriesData = await Promise.all(
//             licensedCategoryIds.map(async categoryId => {
//                 const category = await Category.findById(categoryId).lean();
//                 if (!category) return null;

//                 const products = await Product.find({ seller: seller._id, category: category._id }).lean();

//                 const formattedProducts = await Promise.all(products.map(async p => {
//                     const productOrders = await Order.find({ "products.productId": p._id }).populate("user", "name email").lean();
//                     const usersBought = [...new Set(
//                         productOrders
//                             .filter(o => o.user) // ensure user exists
//                             .map(o => o.user.name) // take the name instead of ID
//                     )];

//                     return {
//                         _id: p._id,
//                         name: p.name,
//                         price: p.price,
//                         quantity: p.quantity,
//                         status: p.status || (p.quantity === 0 ? 'Out of stock' : p.quantity < (p.thresholdValue || 5) ? 'Low stock' : 'In-stock'),
//                         images: p.images?.length ? p.images[0] : null,
//                         variantsCount: p.variants?.length || 0,
//                         isPublished: p.isPublished || false,
//                         usersBought,
//                         totalOrders: productOrders.reduce((sum, o) => sum + o.products.filter(pr => pr.productId.toString() === p._id.toString()).reduce((s, pr) => s + pr.quantity, 0), 0)
//                     };
//                 }));

//                 // Trending products by total orders
//                 const trendingProducts = formattedProducts
//                     .sort((a, b) => b.totalOrders - a.totalOrders)
//                     .slice(0, 5);

//                 return {
//                     categoryId: category._id,
//                     categoryName: category.name,
//                     licenceStatus: sellerLicences.find(l => l.category.toString() === category._id.toString()).approved ? "approved" : "pending",
//                     canAddProduct: sellerLicences.find(l => l.category.toString() === category._id.toString()).approved,
//                     totalProducts: products.length,
//                     products: formattedProducts,
//                     trendingProducts
//                 };
//             })
//         );

//         res.json({
//             summary: {
//                 totalCategories,
//                 totalProducts,
//                 totalOrders,
//                 totalRevenue
//             },
//             categories: categoriesData.filter(c => c !== null)
//         });

//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// };



export const sellerDashboard = async (req, res) => {
    try {
        const seller = req.seller;
        if (!seller) return res.status(401).json({ message: "Unauthorized" });

        const sellerLicences = seller.licences || [];
        const licensedCategoryIds = sellerLicences
            .filter(l => l.category)
            .map(l => l.category.toString());

        // ---------------- SUMMARY ----------------
        const totalCategories = sellerLicences.length;
        const totalProducts = await Product.countDocuments({ seller: seller._id });

        // Top selling products
        const topSellingProductsData = await Product.find({ seller: seller._id })
            .sort({ sales: -1 })
            .limit(5)
            .select("name sales")
            .lean();
        const topSellingProductsCount = topSellingProductsData.length;
        const topSellingProductsPercent = totalProducts ? Math.round((topSellingProductsCount / totalProducts) * 100) : 0;

        // Top reviewed products
        const productIds = (await Product.find({ seller: seller._id }).select("_id").lean()).map(p => p._id);
        const reviewsAgg = await Review.aggregate([
            { $match: { productId: { $in: productIds }, status: "Active" } },
            { $group: { _id: "$productId", avgRating: { $avg: "$rating" } } },
            { $sort: { avgRating: -1 } },
            { $limit: 5 }
        ]);
        const topReviewedProductsCount = reviewsAgg.length;
        const topReviewedProductsPercent = totalProducts ? Math.round((topReviewedProductsCount / totalProducts) * 100) : 0;

        // ---------------- CATEGORY DATA ----------------
        const categoriesData = await Promise.all(
            licensedCategoryIds.map(async categoryId => {
                const category = await Category.findById(categoryId).lean();
                if (!category) return null;

                const products = await Product.find({ seller: seller._id, category: category._id }).lean();

                const formattedProducts = products.map(p => ({
                    _id: p._id,
                    name: p.name,
                    price: p.price,
                    quantity: p.quantity,
                    status: p.status || (p.quantity === 0 ? 'Out of stock' : p.quantity < (p.thresholdValue || 5) ? 'Low stock' : 'In-stock'),
                    images: p.images?.length ? p.images[0] : null,
                    variantsCount: p.variants?.length || 0,
                    sales: p.sales || 0,
                    isPublished: p.isPublished || false
                }));

                const licence = sellerLicences.find(
                    l => l && l.category && l.category.toString() === category._id.toString()
                );

                // Trending products (top 5 by sales)
                const trendingProducts = formattedProducts
                    .sort((a, b) => b.sales - a.sales)
                    .slice(0, 5);

                // Top review-based products (top 5 by rating)
                const reviewRatings = await Review.aggregate([
                    { $match: { productId: { $in: products.map(p => p._id) }, status: "Active" } },
                    { $group: { _id: "$productId", avgRating: { $avg: "$rating" } } },
                    { $sort: { avgRating: -1 } },
                    { $limit: 5 }
                ]);
                const topReviewBased = formattedProducts.filter(p =>
                    reviewRatings.some(r => r._id.toString() === p._id.toString())
                );

                return {
                    categoryId: category._id,
                    categoryName: category.name,
                    licenceStatus: licence?.approved ? "approved" : "pending",
                    canAddProduct: licence?.approved || false,
                    totalProducts: formattedProducts.length,
                    products: formattedProducts,
                    trendingProducts,
                    topReviewBased
                };
            })
        );

        res.json({
            summary: {
                totalCategories,
                totalProducts,
                topSellingProducts: {
                    count: topSellingProductsCount,
                    percentage: topSellingProductsPercent
                },
                topReviewedProducts: {
                    count: topReviewedProductsCount,
                    percentage: topReviewedProductsPercent
                }
            },
            categories: categoriesData.filter(c => c !== null)
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};


export const getSellerLicences = async (req, res) => {
    try {
        const seller = req.seller;
        if (!seller) return res.status(401).json({ message: "Unauthorized" });

        const allCategories = await Category.find({}).lean();

        const currentLicences = [];
        const pendingLicences = [];

        seller.licences.forEach(l => {
            const categoryDoc = allCategories.find(cat => cat._id.toString() === l.category.toString());
            const licenceData = {
                _id: l._id,
                categoryId: l.category,
                categoryName: categoryDoc ? categoryDoc.name : null,
                docUrl: l.docUrl,
                approved: l.approved,
                uploadedAt: l.uploadedAt
            };

            if (l.approved) currentLicences.push(licenceData);
            else pendingLicences.push(licenceData);
        });

        const availableCategories = allCategories.filter(
            cat => !seller.licences.some(l => l.category.toString() === cat._id.toString())
        );

        res.json({
            currentLicences,
            pendingLicences,
            availableCategories
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

export const uploadLicence = async (req, res) => {
    try {
        const seller = req.seller;
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        const { category } = req.body;
        const file = req.file;

        if (!category || !file) {
            return res.status(400).json({ message: "Category and licence document required" });
        }

        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) return res.status(400).json({ message: "Invalid category ID" });

        // file.path comes from CloudinaryStorage via multer
        const docUrl = file.path;

        // check if licence for this category already exists
        const existingLicence = seller.licences.find(
            l => l.category.toString() === category.toString()
        );
        if (existingLicence) {
            return res.status(400).json({
                message: "Licence already uploaded for this category. Awaiting admin approval."
            });
        }

        // push new licence
        seller.licences.push({
            category,
            docUrl,
            approved: false,
            uploadedAt: new Date()
        });

        await seller.save();

        res.json({
            message: "Licence uploaded successfully. Pending admin approval.",
            licence: {
                _id: seller.licences[seller.licences.length - 1]._id,
                category: categoryDoc.name,
                docUrl,
                approved: false
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Upload licence failed", error: err.message });
    }
};