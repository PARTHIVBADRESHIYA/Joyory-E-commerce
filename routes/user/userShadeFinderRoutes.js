import express from "express";
import { getTones, getUndertones, getFamilies, getRecommendations, getFormulations} from "../../controllers/user/userShadeFinderController.js";

import {
    toneSchema,
    undertoneSchema,
    familySchema,
    recommendationSchema,
} from "../../middlewares/validations/shadeFinderValidation.js";

import { validate } from "../../middlewares/validations/validate.js";

const router = express.Router();

// Step 1: tones
router.get("/tones", validate(toneSchema), getTones);       

// Step 2: undertones
router.get("/undertones", validate(undertoneSchema), getUndertones);

// Step 3: families (like ivory, beige, sand, etc.)
router.get("/families", validate(familySchema), getFamilies);

// Step 4: formulations (like ivory, beige, sand, etc.)
router.get("/formulations", getFormulations);

// Step 4: recommendations (final product suggestions)
router.get(
    "/recommendations",
    validate(recommendationSchema),
    getRecommendations
);

export default router;
