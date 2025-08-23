import User from "../../../models/User.js";
import Product from "../../../models/Product.js";
import mongoose from "mongoose";

// ➕ Add product to wishlist (by :productId param)
export const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.params; // ✅ take ID from URL
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: "Product not found" });

        await User.findByIdAndUpdate(userId, {
            $addToSet: { wishlist: productId } // prevent duplicates
        });

        res.status(200).json({ success: true, message: "Added to wishlist" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};


// ➖ Remove product from wishlist
export const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user._id;

        await User.findByIdAndUpdate(userId, {
            $pull: { wishlist: productId }
        });

        res.status(200).json({ success: true, message: "Removed from wishlist" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 📌 Get all wishlist items
export const getWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate("wishlist", "name price images brand category avgRating totalRatings commentsCount inStock");

        res.status(200).json({
            success: true,
            wishlist: user.wishlist
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Move from wishlist to cart
export const moveToCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user._id;

        // 1️⃣ Add product to cart
        await User.findByIdAndUpdate(userId, {
            $push: { cart: { product: productId, qty: 1 } }  // or use your cart logic
        });

        // 2️⃣ Remove product from wishlist
        await User.findByIdAndUpdate(userId, {
            $pull: { wishlist: productId }
        });

        res.status(200).json({ success: true, message: "Moved to cart" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
