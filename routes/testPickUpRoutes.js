// routes/testRoutes.js
import express from "express";
import { getShiprocketToken } from "../middlewares/services/shiprocket.js"; // helper to fetch token
import axios from "axios";

const router = express.Router();

// 🚀 Test route to fetch pickup locations
router.get("/shiprocket/pickups", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await axios.get(
            "https://apiv2.shiprocket.in/v1/external/settings/company/pickup",
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        res.json({
            success: true,
            pickups: response.data,
        });
    } catch (err) {
        console.error("❌ Shiprocket Pickup Fetch Failed:", err.response?.data || err.message);
        res.status(500).json({
            success: false,
            error: err.response?.data || err.message,
        });
    }
});

export default router;
