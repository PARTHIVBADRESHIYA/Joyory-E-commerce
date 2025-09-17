import mongoose from "mongoose";
import Product from "../../models/Product.js";
import {
    addProductController,
    updateProductById,
} from "../productController.js";

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