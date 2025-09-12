// import Seller from '../models/Seller.js';
// import Order from '../models/Order.js';
// import PayoutLedger from '../models/PayoutLedger.js';
// import Product from '../models/Product.js';
// import { encrypt } from '../middlewares/utils/encryption.js';
// import { uploadBufferToCloudinary } from '../middlewares/utils/cloudinary.js';
// import { generatePayoutForSeller } from '../middlewares/services/payoutService.js';
// import { addProductController, updateProductById } from "../controllers/productController.js";

// // =============== APPLY AS SELLER ===============
// export const registerSeller = async (req, res) => {
//     try {
//         if (!req.body || Object.keys(req.body).length === 0) {
//             return res.status(400).json({ message: 'Request body is missing' });
//         }

//         const { businessName, gstNumber, panNumber, addresses, bankDetails } = req.body;

//         if (!businessName) {
//             return res.status(400).json({ message: 'Business name is required' });
//         }

//         const exists = await Seller.findOne({ user: req.user._id });
//         if (exists) {
//             return res.status(400).json({ message: 'You already applied as a seller' });
//         }

//         const seller = new Seller({
//             user: req.user._id,
//             businessName,
//             gstNumber,
//             panNumber,
//             addresses,
//             bankDetails: bankDetails
//                 ? {
//                     ...bankDetails,
//                     accountNumberEncrypted: bankDetails.accountNumber
//                         ? encrypt(bankDetails.accountNumber)
//                         : undefined,
//                 }
//                 : undefined,
//         });

//         await seller.save();
//         console.log('✅ Seller registered:', seller._id);

//         return res.status(201).json({
//             message: 'Seller application submitted',
//             seller,
//         });
//     } catch (err) {
//         console.error('🔥 registerSeller error:', err);
//         return res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// // =============== UPLOAD KYC DOCUMENTS ===============
// export const uploadKyc = async (req, res) => {
//     try {
//         const seller = await Seller.findOne({ user: req.user._id });
//         if (!seller) return res.status(404).json({ message: 'Seller not found' });

//         const files = req.files || [];
//         if (files.length === 0) {
//             return res.status(400).json({ message: 'No KYC files uploaded' });
//         }

//         const uploaded = [];
//         for (const f of files) {
//             try {
//                 const result = await uploadBufferToCloudinary(f.buffer, `kyc/${seller._id}`);
//                 seller.kycDocs.push({
//                     url: result.secure_url,
//                     filename: f.originalname,
//                     uploadedAt: new Date(),
//                     public_id: result.public_id,
//                 });
//                 uploaded.push({ url: result.secure_url, filename: f.originalname });
//             } catch (cloudErr) {
//                 console.error('❌ Cloudinary upload failed:', cloudErr);
//             }
//         }

//         await seller.save();
//         console.log(`✅ ${uploaded.length} KYC docs uploaded for seller ${seller._id}`);

//         return res.json({ message: 'KYC uploaded', uploaded });
//     } catch (err) {
//         console.error('🔥 uploadKyc error:', err);
//         return res.status(500).json({ message: 'Upload failed', error: err.message });
//     }
// };

// // =============== GET PROFILE ===============
// export const getSellerProfile = async (req, res) => {
//     try {
//         const seller = await Seller.findOne({ user: req.user._id }).lean();
//         if (!seller) return res.status(404).json({ message: 'Seller not found' });
//         return res.json(seller);
//     } catch (err) {
//         console.error('🔥 getSellerProfile error:', err);
//         return res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// // =============== UPDATE PROFILE ===============
// export const updateSeller = async (req, res) => {
//     try {
//         if (!req.body) return res.status(400).json({ message: 'Request body missing' });

//         const update = { ...req.body };
//         if (update.bankDetails?.accountNumber) {
//             update.bankDetails.accountNumberEncrypted = encrypt(update.bankDetails.accountNumber);
//             delete update.bankDetails.accountNumber;
//         }

//         const seller = await Seller.findOneAndUpdate(
//             { user: req.user._id },
//             update,
//             { new: true }
//         );

//         if (!seller) return res.status(404).json({ message: 'Seller not found' });

//         console.log('✅ Seller updated:', seller._id);
//         return res.json(seller);
//     } catch (err) {
//         console.error('🔥 updateSeller error:', err);
//         return res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// // =============== LIST ORDERS ===============
// export const listSellerOrders = async (req, res) => {
//     try {
//         const seller = req.seller; // set in seller.middleware
//         if (!seller) return res.status(403).json({ message: 'Seller context missing' });

//         const page = parseInt(req.query.page) || 1;
//         const limit = Math.min(parseInt(req.query.limit) || 20, 100);
//         const skip = (page - 1) * limit;

//         const matchSplit = { 'splitOrders.seller': seller._id };

//         const results = await Order.aggregate([
//             { $match: matchSplit },
//             {
//                 $project: {
//                     orderId: 1,
//                     user: 1,
//                     splitOrders: 1,
//                     amount: 1,
//                     paymentStatus: 1,
//                     createdAt: 1,
//                 },
//             },
//             { $sort: { createdAt: -1 } },
//             { $skip: skip },
//             { $limit: limit },
//         ]);

//         console.log(`✅ Found ${results.length} orders for seller ${seller._id}`);
//         return res.json({ data: results, page, limit });
//     } catch (err) {
//         console.error('🔥 listSellerOrders error:', err);
//         return res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// // =============== SHIP ORDER ===============
// export const shipOrder = async (req, res) => {
//     try {
//         const seller = req.seller;
//         const { orderId } = req.params;
//         const { trackingNumber, courierName } = req.body;

//         const order = await Order.findOne({ orderId });
//         if (!order) return res.status(404).json({ message: 'Order not found' });

//         const split = (order.splitOrders || []).find(
//             (s) => s.seller?.toString() === seller._id.toString()
//         );
//         if (!split) return res.status(404).json({ message: 'Split order not found' });

//         split.trackingNumber = trackingNumber;
//         split.courierName = courierName;
//         split.status = 'shipped';

//         await order.save();
//         console.log(`📦 Order ${orderId} marked shipped by seller ${seller._id}`);

//         return res.json({ message: 'Marked shipped', order });
//     } catch (err) {
//         console.error('🔥 shipOrder error:', err);
//         return res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// // =============== GET PAYOUTS ===============
// export const getPayouts = async (req, res) => {
//     try {
//         const payouts = await PayoutLedger.find({ seller: req.seller._id }).sort({
//             createdAt: -1,
//         });
//         console.log(`✅ Found ${payouts.length} payouts for seller ${req.seller._id}`);
//         return res.json(payouts);
//     } catch (err) {
//         console.error('🔥 getPayouts error:', err);
//         return res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// // =============== REQUEST PAYOUT ===============
// export const requestPayout = async (req, res) => {
//     try {
//         const ledger = await generatePayoutForSeller(req.seller._id);
//         console.log(`💰 Payout ledger created for seller ${req.seller._id}: ${ledger._id}`);
//         return res.json({ message: 'Payout ledger generated', ledger });
//     } catch (err) {
//         console.error('🔥 requestPayout error:', err);
//         return res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };




// // Wrapper: Add Product by Seller
// export const addProductBySeller = async (req, res) => {
//     try {
//         // attach seller automatically
//         req.body.seller = req.seller._id;
//         req.body.status = "pending"; // sellers cannot directly approve

//         return addProductController(req, res); // reuse admin logic
//     } catch (err) {
//         console.error("🔥 addProductBySeller error:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };

// // Wrapper: Update Product by Seller
// export const updateProductBySeller = async (req, res) => {
//     try {
//         const product = await Product.findById(req.params.id);

//         if (!product) return res.status(404).json({ message: "Product not found" });

//         // Ensure seller owns the product
//         if (product.seller.toString() !== req.seller._id.toString()) {
//             return res.status(403).json({ message: "You can only edit your own products" });
//         }

//         return updateProductById(req, res); // reuse admin update logic
//     } catch (err) {
//         console.error("🔥 updateProductBySeller error:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };

// // Seller List Products
// export const listSellerProducts = async (req, res) => {
//     try {
//         const products = await Product.find({ seller: req.seller._id }).populate("category", "name");
//         res.json(products);
//     } catch (err) {
//         console.error("🔥 listSellerProducts error:", err);
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// };















import Seller from "../models/Seller.js";
import Order from "../models/Order.js";
import PayoutLedger from "../models/PayoutLedger.js";
import Product from "../models/Product.js";
import { encrypt } from "../middlewares/utils/encryption.js";
import { uploadBufferToCloudinary } from "../middlewares/utils/cloudinary.js";
import { generatePayoutForSeller } from "../middlewares/services/payoutService.js";
import {
    addProductController,
    updateProductById,
} from "../controllers/productController.js";

// ================= APPLY AS SELLER =================
export const registerSeller = async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ message: "Request body is missing" });
        }

        const { businessName, gstNumber, panNumber, addresses, bankDetails } =
            req.body;

        if (!businessName) {
            return res.status(400).json({ message: "Business name is required" });
        }

        const exists = await Seller.findOne({ user: req.user._id });
        if (exists) {
            return res
                .status(400)
                .json({ message: "You already applied as a seller" });
        }

        const seller = new Seller({
            user: req.user._id,
            businessName,
            gstNumber,
            panNumber,
            addresses,
            bankDetails: bankDetails
                ? {
                    ...bankDetails,
                    accountNumberEncrypted: bankDetails.accountNumber
                        ? encrypt(bankDetails.accountNumber)
                        : undefined,
                }
                : undefined,
        });

        await seller.save();
        console.log("✅ Seller registered:", seller._id);

        return res.status(201).json({
            message: "Seller application submitted",
            seller,
        });
    } catch (err) {
        console.error("🔥 registerSeller error:", err);
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
};

// ================= UPLOAD KYC DOCUMENTS =================
export const uploadKyc = async (req, res) => {
    try {
        const seller = await Seller.findOne({ user: req.user._id });
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ message: "No KYC files uploaded" });
        }

        const uploaded = [];
        for (const f of files) {
            try {
                const result = await uploadBufferToCloudinary(
                    f.buffer,
                    `kyc/${seller._id}`
                );
                seller.kycDocs.push({
                    url: result.secure_url,
                    filename: f.originalname,
                    uploadedAt: new Date(),
                    public_id: result.public_id,
                });
                uploaded.push({ url: result.secure_url, filename: f.originalname });
            } catch (cloudErr) {
                console.error("❌ Cloudinary upload failed:", cloudErr);
            }
        }

        await seller.save();
        console.log(`✅ ${uploaded.length} KYC docs uploaded for seller ${seller._id}`);

        return res.json({ message: "KYC uploaded", uploaded });
    } catch (err) {
        console.error("🔥 uploadKyc error:", err);
        return res
            .status(500)
            .json({ message: "Upload failed", error: err.message });
    }
};

// ================= GET PROFILE =================
export const getSellerProfile = async (req, res) => {
    try {
        const seller = await Seller.findOne({ user: req.user._id }).lean();
        if (!seller) return res.status(404).json({ message: "Seller not found" });
        return res.json(seller);
    } catch (err) {
        console.error("🔥 getSellerProfile error:", err);
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
};

// ================= UPDATE PROFILE =================
export const updateSeller = async (req, res) => {
    try {
        if (!req.body) return res.status(400).json({ message: "Request body missing" });

        const update = { ...req.body };
        if (update.bankDetails?.accountNumber) {
            update.bankDetails.accountNumberEncrypted = encrypt(
                update.bankDetails.accountNumber
            );
            delete update.bankDetails.accountNumber;
        }

        const seller = await Seller.findOneAndUpdate(
            { user: req.user._id },
            update,
            { new: true }
        );

        if (!seller) return res.status(404).json({ message: "Seller not found" });

        console.log("✅ Seller updated:", seller._id);
        return res.json(seller);
    } catch (err) {
        console.error("🔥 updateSeller error:", err);
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
};

// ================= LIST ORDERS =================
// export const listSellerOrders = async (req, res) => {
//     try {
//         const seller = req.seller;
//         if (!seller) return res.status(403).json({ message: "Seller context missing" });

//         const page = parseInt(req.query.page) || 1;
//         const limit = Math.min(parseInt(req.query.limit) || 20, 100);
//         const skip = (page - 1) * limit;

//         const matchSplit = { "splitOrders.seller": seller._id };

//         const results = await Order.aggregate([
//             { $match: matchSplit },
//             {
//                 $project: {
//                     orderId: 1,
//                     user: 1,
//                     splitOrders: 1,
//                     amount: 1,
//                     paymentStatus: 1,
//                     createdAt: 1,
//                 },
//             },
//             { $sort: { createdAt: -1 } },
//             { $skip: skip },
//             { $limit: limit },
//         ]);

//         console.log(`✅ Found ${results.length} orders for seller ${seller._id}`);
//         return res.json({ data: results, page, limit });
//     } catch (err) {
//         console.error("🔥 listSellerOrders error:", err);
//         return res
//             .status(500)
//             .json({ message: "Server error", error: err.message });
//     }
// };

export const listSellerOrders = async (req, res) => {
    try {
        const seller = req.seller;
        if (!seller) return res.status(403).json({ message: "Seller context missing" });

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        // ✅ First try with splitOrders
        let results = await Order.aggregate([
            { $match: { "splitOrders.seller": seller._id } },
            {
                $project: {
                    orderId: 1,
                    user: 1,
                    splitOrders: 1,
                    amount: 1,
                    paymentStatus: 1,
                    createdAt: 1,
                },
            },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
        ]);

        // ✅ If no splitOrders found, fallback to products.seller
        if (!results.length) {
            results = await Order.aggregate([
                { $match: { "products.seller": seller._id, paid: true } }, // only paid orders
                {
                    $project: {
                        orderId: 1,
                        user: 1,
                        products: 1,
                        amount: 1,
                        paymentStatus: 1,
                        createdAt: 1,
                    },
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
            ]);
        }

        console.log(`✅ Found ${results.length} orders for seller ${seller._id}`);
        return res.json({ data: results, page, limit });
    } catch (err) {
        console.error("🔥 listSellerOrders error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};


// ================= SHIP ORDER =================
export const shipOrder = async (req, res) => {
    try {
        const seller = req.seller;
        const { orderId } = req.params;
        const { trackingNumber, courierName } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) return res.status(404).json({ message: "Order not found" });

        const split = (order.splitOrders || []).find(
            (s) => s.seller?.toString() === seller._id.toString()
        );
        if (!split) return res.status(404).json({ message: "Split order not found" });

        split.trackingNumber = trackingNumber;
        split.courierName = courierName;
        split.status = "shipped";

        await order.save();
        console.log(`📦 Order ${orderId} marked shipped by seller ${seller._id}`);

        return res.json({ message: "Marked shipped", order });
    } catch (err) {
        console.error("🔥 shipOrder error:", err);
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
};

// ================= GET PAYOUTS =================
export const getPayouts = async (req, res) => {
    try {
        const payouts = await PayoutLedger.find({ seller: req.seller._id }).sort({
            createdAt: -1,
        });
        console.log(`✅ Found ${payouts.length} payouts for seller ${req.seller._id}`);
        return res.json(payouts);
    } catch (err) {
        console.error("🔥 getPayouts error:", err);
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
};

// ================= REQUEST PAYOUT =================
export const requestPayout = async (req, res) => {
    try {
        const ledger = await generatePayoutForSeller(req.seller._id);
        console.log(`💰 Payout ledger created for seller ${req.seller._id}: ${ledger._id}`);
        return res.json({ message: "Payout ledger generated", ledger });
    } catch (err) {
        console.error("🔥 requestPayout error:", err);
        return res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
};

// ================= ADD PRODUCT BY SELLER =================
export const addProductBySeller = async (req, res) => {
    try {
        req.body.seller = req.seller._id;
        req.body.status = "pending"; // sellers cannot auto-approve

        // Forward files/images to admin addProductController
        return addProductController(req, res);
    } catch (err) {
        console.error("🔥 addProductBySeller error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= UPDATE PRODUCT BY SELLER =================
export const updateProductBySeller = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: "Product not found" });

        if (product.seller.toString() !== req.seller._id.toString()) {
            return res
                .status(403)
                .json({ message: "You can only edit your own products" });
        }

        return updateProductById(req, res);
    } catch (err) {
        console.error("🔥 updateProductBySeller error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= LIST SELLER PRODUCTS =================
export const listSellerProducts = async (req, res) => {
    try {
        const products = await Product.find({ seller: req.seller._id }).populate(
            "category",
            "name"
        );
        res.json(products);
    } catch (err) {
        console.error("🔥 listSellerProducts error:", err);
        res
            .status(500)
            .json({ message: "Server error", error: err.message });
    }
};
