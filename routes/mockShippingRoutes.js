// routes/mockShipping.routes.js
import express from "express";
import { getTracking, advanceShipment } from "../middlewares/services/shippingProvider.js";

const r = express.Router();

r.get("/track/:shipmentId", async (req, res) => {
    try {
        const data = await getTracking(req.params.shipmentId);
        if (!data) return res.status(404).json({ error: "Not found" });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

r.post("/advance/:shipmentId", async (req, res) => {
    try {
        const data = await advanceShipment(req.params.shipmentId);
        res.json({ ok: true, data });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

export default r;
