import mongoose from "mongoose";
import Seller from "../models/Seller.js";
import Order from "../models/Order.js";
import PayoutLedger from "../models/PayoutLedger.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { encrypt } from "../middlewares/utils/encryption.js";
import { uploadBufferToCloudinary } from "../middlewares/utils/cloudinary.js";
import { generatePayoutForSeller } from "../middlewares/services/payoutService.js";
import {
    addProductController,
    updateProductById,
} from "../controllers/productController.js";

// ================= UPLOAD KYC DOCUMENTS =================
export const uploadKyc = async (req, res) => {
    try {
        const seller = req.seller;
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        const files = req.files || [];
        if (!files.length) {
            return res.status(400).json({ message: "No KYC files uploaded" });
        }

        const uploaded = [];
        for (const f of files) {
            try {
                const result = await uploadBufferToCloudinary(f.buffer, `kyc/${seller._id}`);
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
        return res.json({ message: "KYC uploaded", uploaded });
    } catch (err) {
        return res.status(500).json({ message: "Upload failed", error: err.message });
    }
};

export const uploadLicences = async (req, res) => {
    try {
        const seller = req.seller; // comes from authenticateSeller middleware
        if (!seller) {
            return res.status(404).json({ message: "Seller not found" });
        }

        const { category } = req.body; // should be ObjectId string
        const file = req.file;

        if (!category || !file) {
            return res.status(400).json({ message: "Category (ObjectId) and licence document required" });
        }

        // ✅ validate category exists
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        // ✅ multer-storage-cloudinary gives `file.path` = Cloudinary secure_url
        const docUrl = file.path;

        // check if already uploaded licence for this category
        const existing = seller.licences.find(
            (lic) => lic.category.toString() === category.toString()
        );
        if (existing) {
            return res.status(400).json({
                message: "Licence already uploaded for this category. Awaiting approval.",
            });
        }

        // push new licence
        seller.licences.push({
            category,
            docUrl,
            approved: false, // will need admin approval
        });

        await seller.save();

        return res.json({
            message: "Licence uploaded. Pending admin approval.",
            licence: {
                _id: seller.licences[seller.licences.length - 1]._id,
                category: categoryDoc.name,
                docUrl,
                approved: false,
            },
        });
    } catch (err) {
        return res.status(500).json({
            message: "Upload licence failed",
            error: err.message,
        });
    }
};

// ================= GET PROFILE =================
export const getSellerProfile = async (req, res) => {
    try {
        return res.json(req.seller);
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= UPDATE PROFILE =================
export const updateSeller = async (req, res) => {
    try {
        const update = { ...req.body };
        if (update.bankDetails?.accountNumber) {
            update.bankDetails.accountNumberEncrypted = encrypt(update.bankDetails.accountNumber);
            delete update.bankDetails.accountNumber;
        }

        const seller = await Seller.findByIdAndUpdate(req.seller._id, update, { new: true });
        if (!seller) return res.status(404).json({ message: "Seller not found" });

        return res.json(seller);
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= LIST ORDERS =================
export const listSellerOrders = async (req, res) => {
    try {
        const seller = req.seller;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const results = await Order.aggregate([
            { $match: { "splitOrders.seller": seller._id } },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    orderId: 1,
                    orderNumber: 1,
                    user: 1,
                    date: 1,
                    customerName: 1,
                    status: 1,
                    orderType: 1,
                    paid: 1,
                    paymentStatus: 1,
                    shippingAddress: 1,
                    splitOrders: {
                        $filter: {
                            input: "$splitOrders",
                            as: "so",
                            cond: { $eq: ["$$so.seller", seller._id] }
                        }
                    }
                }
            },
            {
                // Recalculate the amount for this seller only
                $addFields: {
                    amount: { $sum: "$splitOrders.amount" }
                }
            }
        ]);


        if (!results.length) {
            results = await Order.aggregate([
                { $match: { "products.seller": seller._id, paid: true } },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
            ]);
        }

        return res.json({ data: results, page, limit });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= SHIP ORDER =================
export const shipOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { trackingNumber, courierName } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) return res.status(404).json({ message: "Order not found" });

        const split = (order.splitOrders || []).find(
            (s) => s.seller?.toString() === req.seller._id.toString()
        );
        if (!split) return res.status(404).json({ message: "Split order not found" });

        split.trackingNumber = trackingNumber;
        split.courierName = courierName;
        split.status = "shipped";

        await order.save();
        return res.json({ message: "Marked shipped", order });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= GET PAYOUTS =================
export const getPayouts = async (req, res) => {
    try {
        if (!req.seller || !req.seller._id) {
            return res.status(401).json({ message: "Unauthorized: Seller not found" });
        }

        // Directly use the seller ObjectId
        const payouts = await PayoutLedger.find({ seller: req.seller._id }).sort({ createdAt: -1 });

        if (!payouts.length) {
            return res.json({ message: "No payouts found for this seller", data: [] });
        }

        return res.json({ data: payouts });
    } catch (err) {
        console.error("Get payouts error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};
// ================= REQUEST PAYOUT =================
export const requestPayout = async (req, res) => {
    try {
        const ledger = await generatePayoutForSeller(req.seller._id);
        return res.json({ message: "Payout ledger generated", ledger });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= ADD PRODUCT =================
// export const addProductBySeller = async (req, res) => {
//     try {
//         const seller = req.seller;

//         // Check if seller has approved licence for this product category
//         const category = req.body.category; // should be category name or ID
//         const hasLicence = seller.licences.some(
//             (lic) => lic.category === category && lic.approved === true
//         );

//         if (!hasLicence) {
//             return res.status(403).json({
//                 message: `You are not licensed to add products in category: ${category}. Please upload and get approval for a licence first.`,
//             });
//         }

//         req.body.seller = seller._id;
//         req.body.status = "pending"; // sellers cannot auto-approve
//         return addProductController(req, res);
//     } catch (err) {
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };


export const addProductBySeller = async (req, res) => {
    try {
        const seller = req.seller;

        const category = req.body.category; // category ID as string
        const hasLicence = seller.licences.some(
            (lic) => lic.category.toString() === category.toString() && lic.approved === true
        );

        if (!hasLicence) {
            return res.status(403).json({
                message: `You are not licensed to add products in category: ${category}. Please upload and get approval for a licence first.`,
            });
        }

        req.body.seller = seller._id;
        req.body.status = "pending"; // sellers cannot auto-approve
        return addProductController(req, res);
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};



// ================= UPDATE PRODUCT =================
export const updateProductBySeller = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: "Product not found" });

        if (product.seller.toString() !== req.seller._id.toString()) {
            return res.status(403).json({ message: "You can only edit your own products" });
        }

        // check licence again if category is being changed
        if (req.body.category && req.body.category !== product.category.toString()) {
            const hasLicence = req.seller.licences.some(
                (lic) => lic.category === req.body.category && lic.approved === true
            );
            if (!hasLicence) {
                return res.status(403).json({
                    message: `You are not licensed to update product into category: ${req.body.category}`,
                });
            }
        }

        return updateProductById(req, res);
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= LIST PRODUCTS =================
export const listSellerProducts = async (req, res) => {
    try {
        const products = await Product.find({ seller: req.seller._id }).populate("category", "name");
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message }); 
    }
};



export const approveLicence = async (req, res) => {
    try {
        const { sellerId, licenceId } = req.params;

        const seller = await Seller.findById(sellerId);
        if (!seller) {
            return res.status(404).json({ message: "Seller not found" });
        }

        const licence = seller.licences.id(licenceId);
        if (!licence) {
            return res.status(404).json({ message: "Licence not found" });
        }

        licence.approved = true;
        await seller.save();

        return res.json({
            message: "Licence approved successfully",
            licence,
        });
    } catch (err) {
        return res.status(500).json({
            message: "Approving licence failed",
            error: err.message,
        });
    }
};