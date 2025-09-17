import mongoose from "mongoose";
import Seller from "../../models/sellers/Seller.js";
import Order from "../../models/Order.js";
import PayoutLedger from "../../models/PayoutLedger.js";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import { encrypt } from "../../middlewares/utils/encryption.js";
import { uploadBufferToCloudinary } from "../../middlewares/utils/cloudinary.js";
import { generatePayoutForSeller } from "../../middlewares/services/payoutService.js";
import {
    addProductController,
    updateProductById,
} from "../productController.js";

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