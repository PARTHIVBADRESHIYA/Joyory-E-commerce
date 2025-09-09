import express from "express";
import { isAdmin } from "../middlewares/authMiddleware.js";
import { getWalletConfig, upsertWalletConfig } from "../controllers/adminWalletController.js";

const router = express.Router();

router.get("/", isAdmin, getWalletConfig);
router.put("/", isAdmin, upsertWalletConfig);

export default router;
