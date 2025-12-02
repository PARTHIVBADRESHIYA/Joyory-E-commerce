import express from "express";
import {
    getAllPermissions,
    getPermissionModules,
    validatePermission,
    createCustomPermission,
    updateCustomPermission,
    deleteCustomPermission,
} from "../controllers/permissionController.js";

const router = express.Router();

// GET
router.get("/", getAllPermissions);
router.get("/modules", getPermissionModules);
router.get("/validate/:key", validatePermission);

// Custom permission CRUD
router.post("/custom", createCustomPermission);
router.put("/custom/:key", updateCustomPermission);
router.delete("/custom/:key", deleteCustomPermission);

export default router;
