import mongoose from "mongoose";
import Product from "../../models/Product.js";
import {
    addProductController,
    updateProductById,
    getAllProducts,
    getSingleProductById,
    updateProductStock,
    deleteProduct,
    updateVariantImages
} from "../productController.js";

import { uploadToCloudinary } from "../../middlewares/upload.js";
// ================= ADD PRODUCT =================
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
        req.body.isPublished = false; // pending products should not be live
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
                (lic) => lic.category.toString() === req.body.category && lic.approved === true
            );
            if (!hasLicence) {
                return res.status(403).json({
                    message: `You are not licensed to update product into category: ${req.body.category}`,
                });
            }
        }

        // prevent sellers from auto-publishing
        if (req.body.status && req.body.status === "approved") {
            req.body.status = "pending";
        }

        return updateProductById(req, res);
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= LIST PRODUCTS =================
export const listSellerProducts = async (req, res) => {
    try {
        const products = await Product.find({ seller: req.seller._id })
            .populate("category", "name")
            .lean();

        // add dashboard-friendly info
        const result = products.map(p => ({
            _id: p._id,
            name: p.name,
            category: p.category?.name || "",
            price: p.price,
            quantity: p.quantity,
            status: p.status || p.quantity === 0 ? 'Out of stock' : p.quantity < (p.thresholdValue || 5) ? 'Low stock' : 'In-stock',
            images: p.images?.length ? p.images[0] : null,
            variantsCount: p.variants?.length || 0,
            isPublished: p.isPublished || false,
            scheduledAt: p.scheduledAt || null
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= GET SINGLE PRODUCT =================
export const getSellerProductById = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, seller: req.seller._id })
            .populate("category", "name")
            .lean();

        if (!product) return res.status(404).json({ message: "Product not found" });

        res.json(product);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= UPDATE STOCK =================
export const updateSellerProductStock = async (req, res) => {
    try {
        const { quantity } = req.body;

        const product = await Product.findOne({ _id: req.params.id, seller: req.seller._id });
        if (!product) return res.status(404).json({ message: "Product not found" });

        const status =
            quantity === 0 ? 'Out of stock' : quantity < (product.thresholdValue || 5) ? 'Low stock' : 'In-stock';

        product.quantity = quantity;
        product.status = status;
        await product.save();

        res.json({ message: "Stock updated successfully", product });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= DELETE PRODUCT =================
export const deleteSellerProduct = async (req, res) => {
    try {
        const product = await Product.findOneAndDelete({ _id: req.params.id, seller: req.seller._id });
        if (!product) return res.status(404).json({ message: "Product not found" });

        res.json({ message: "Product deleted successfully", product });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= UPDATE VARIANT IMAGES =================
export const updateSellerVariantImages = async (req, res) => {
    req.body.seller = req.seller._id; // ensure variant update is seller-bound
    return updateVariantImages(req, res);
};
