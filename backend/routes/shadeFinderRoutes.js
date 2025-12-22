import express from "express";
import {
    createTone, getTonesAdmin, updateTone, deleteTone,
    createUndertone, getUndertonesAdmin, updateUndertone, deleteUndertone,
    createFamily, getFamiliesAdmin, updateFamily, deleteFamily,
    getAllShadesAdmin, assignShadesToProduct,createFormulation,getFormulationsAdmin,updateFormulation,deleteFormulation,getAllFormulationsOverview
} from "../controllers/shadeFinderController.js";

import { isAdmin } from "../middlewares/authMiddleware.js";
import { uploadTones, uploadUndertones, uploadFamilies ,uploadFormulations} from "../middlewares/upload.js";

const router = express.Router();

// ----------------- Tones -----------------
router.post(
    "/tones",
    isAdmin,
    uploadTones.fields([{ name: "heroImages", maxCount: 6 }]),
    createTone
);
router.get("/tones", isAdmin, getTonesAdmin);
router.put(
    "/tones/:id",
    isAdmin,
    uploadTones.fields([{ name: "heroImages", maxCount: 6 }]),
    updateTone
);
router.delete("/tones/:id", isAdmin, deleteTone);

// ----------------- Undertones -----------------
router.post(
    "/undertones",
    isAdmin,
    uploadUndertones.fields([{ name: "image", maxCount: 1 }]),
    createUndertone
);
router.get("/undertones", isAdmin, getUndertonesAdmin);
router.put(
    "/undertones/:id",
    isAdmin,
    uploadUndertones.fields([{ name: "image", maxCount: 1 }]),
    updateUndertone
);
router.delete("/undertones/:id", isAdmin, deleteUndertone);

// ----------------- Families -----------------
router.post(
    "/families",
    isAdmin,
    uploadFamilies.fields([{ name: "sampleImages", maxCount: 1 }]),
    createFamily
);
router.get("/families", isAdmin, getFamiliesAdmin);
router.put(
    "/families/:id",
    isAdmin,
    uploadFamilies.fields([{ name: "sampleImages", maxCount: 1 }]),
    updateFamily
);
router.delete("/families/:id", isAdmin, deleteFamily);

// ----------------- Overview -----------------
router.get("/all", isAdmin, getAllShadesAdmin);

// ----------------- Assign shades -----------------
router.put("/products/:productId/shades", isAdmin, assignShadesToProduct);

// ----------------- Formulations -----------------

router.post("/formulations",isAdmin,uploadFormulations.fields([{ name: "image", maxCount: 1 }]), createFormulation);
router.get("/formulations", getFormulationsAdmin);
router.put("/formulations/:id", isAdmin,uploadFormulations.fields([{ name: "image", maxCount: 1 }]),updateFormulation);
router.delete("/formulations/:id", deleteFormulation);
router.get("/formulations-overview", getAllFormulationsOverview);

export default router;
