import Tone from "../models/shade/Tone.js";
import Undertone from "../models/shade/Undertone.js";
import ShadeFamily from "../models/shade/Family.js";
import Formulation from "../models/shade/Formulation.js";
import Product from "../models/Product.js";
import { uploadToCloudinary } from "../middlewares/upload.js";
// ----------- TONE CRUD -----------
export const createTone = async (req, res) => {
    try {
        const { key, name, order, swatchHex } = req.body;

        let heroImage = "";

        // Upload only if file exists AND has buffer
        if (req.files?.heroImage?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.heroImage[0].buffer,
                "tones"
            );

            // handle both string (url) and object with secure_url
            heroImage = typeof result === "string" ? result : result.secure_url;
        }
        const tone = await Tone.create({ key, name, order, swatchHex, heroImage });
        res.status(201).json({ success: true, tone });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

export const getTonesAdmin = async (req, res) => {
    try {
        const tones = await Tone.find().sort({ order: 1 });
        res.json({ success: true, tones });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
export const updateTone = async (req, res) => {
    try {
        const update = { ...req.body };
        // if heroImage file uploaded → upload to cloudinary
        if (req.files?.heroImage?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.heroImage[0].buffer,
                "tones"
            );

            update.heroImage =
                typeof result === "string" ? result : result.secure_url;
        }
        const tone = await Tone.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!tone) return res.status(404).json({ success: false, message: "Tone not found" });
        res.json({ success: true, tone });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
export const deleteTone = async (req, res) => {
    try {
        const tone = await Tone.findByIdAndDelete(req.params.id);
        if (!tone) return res.status(404).json({ success: false, message: "Tone not found" });
        res.json({ success: true, message: "Tone deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ----------- UNDERTONE CRUD -----------
export const createUndertone = async (req, res) => {
    try {
        const { key, name, order, description } = req.body;
        let image = "";

        // Upload only if file exists AND has buffer
        if (req.files?.image?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.image[0].buffer,
                "undertones"
            );

            // Accept both string or secure_url
            image = typeof result === "string" ? result : result.secure_url;
        }
        const undertone = await Undertone.create({ key, name, order, description, image });
        res.status(201).json({ success: true, undertone });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
export const getUndertonesAdmin = async (req, res) => {
    try {
        const undertones = await Undertone.find().sort({ order: 1 });
        res.json({ success: true, undertones });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
export const updateUndertone = async (req, res) => {
    try {
        const update = { ...req.body };

        // Upload new image if present
        if (req.files?.image?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.image[0].buffer,
                "undertones"
            );

            update.image = typeof result === "string" ? result : result.secure_url;
        }
        const undertone = await Undertone.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!undertone) return res.status(404).json({ success: false, message: "Undertone not found" });
        res.json({ success: true, undertone });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
export const deleteUndertone = async (req, res) => {
    try {
        const undertone = await Undertone.findByIdAndDelete(req.params.id);
        if (!undertone) return res.status(404).json({ success: false, message: "Undertone not found" });
        res.json({ success: true, message: "Undertone deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ----------- SHADE FAMILY CRUD -----------
export const createFamily = async (req, res) => {
    try {
        const { key, name, toneKeys, undertoneKeys, order, lab } = req.body;
        let sampleImages = [];

        if (req.files?.sampleImages?.length) {
            // Upload each image to Cloudinary
            for (const file of req.files.sampleImages) {
                if (file.buffer) {
                    const result = await uploadToCloudinary(file.buffer, "shadeFamilies");
                    sampleImages.push(typeof result === "string" ? result : result.secure_url);
                }
            }
        }
        const family = await ShadeFamily.create({ key, name, toneKeys, undertoneKeys, order, sampleImages, lab });
        res.status(201).json({ success: true, family });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
export const getFamiliesAdmin = async (req, res) => {
    try {
        const families = await ShadeFamily.find().sort({ order: 1 });
        res.json({ success: true, families });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
export const updateFamily = async (req, res) => {
    try {
        const update = { ...req.body };
        if (req.files?.sampleImages?.length) {
            update.sampleImages = [];
            for (const file of req.files.sampleImages) {
                if (file.buffer) {
                    const result = await uploadToCloudinary(file.buffer, "shadeFamilies");
                    update.sampleImages.push(typeof result === "string" ? result : result.secure_url);
                }
            }
        }
        const family = await ShadeFamily.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!family) return res.status(404).json({ success: false, message: "Family not found" });
        res.json({ success: true, family });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
export const deleteFamily = async (req, res) => {
    try {
        const family = await ShadeFamily.findByIdAndDelete(req.params.id);
        if (!family) return res.status(404).json({ success: false, message: "Family not found" });
        res.json({ success: true, message: "Family deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ----------- ADMIN OVERVIEW -----------
export const getAllShadesAdmin = async (req, res) => {
    try {
        const tones = await Tone.find().sort({ order: 1 });
        const undertones = await Undertone.find().sort({ order: 1 });
        const families = await ShadeFamily.find().sort({ order: 1 });
        res.json({ success: true, tones, undertones, families });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ----------- ASSIGN SHADES TO PRODUCT -----------
export const assignShadesToProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { variants } = req.body; // array of { sku, shadeName, familyKey, toneKeys, undertoneKeys, hex, images, price, stock }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        // Validate each variant against ShadeFamily (optional)
        for (let v of variants) {
            if (!v.familyKey && v.toneKeys?.length && v.undertoneKeys?.length) {
                const family = await ShadeFamily.findOne({
                    toneKeys: { $in: v.toneKeys },
                    undertoneKeys: { $in: v.undertoneKeys }
                });
                if (family) v.familyKey = family.key;
            }
        }

        product.variants = variants;
        await product.save();

        res.json({ success: true, product });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ----------- FORMULATION CRUD -----------
export const createFormulation = async (req, res) => {
    try {
        const { key, name, order } = req.body;
        let image = null;

        // Upload image to Cloudinary if file exists and has buffer
        if (req.files?.image?.[0]?.buffer) {
            const result = await uploadToCloudinary(req.files.image[0].buffer, "formulations");
            image = typeof result === "string" ? result : result.secure_url;
        }

        const formulation = await Formulation.create({ key, name, order, image });
        res.status(201).json({ success: true, formulation });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

export const getFormulationsAdmin = async (req, res) => {
    try {
        const formulations = await Formulation.find().sort({ order: 1 });
        res.json({ success: true, formulations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateFormulation = async (req, res) => {
    try {
        const update = { ...req.body };
        // Update image only if a new file is uploaded
        if (req.files?.image?.[0]?.buffer) {
            const result = await uploadToCloudinary(req.files.image[0].buffer, "formulations");
            update.image = typeof result === "string" ? result : result.secure_url;
        }

        const formulation = await Formulation.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!formulation) return res.status(404).json({ success: false, message: "Formulation not found" });

        res.json({ success: true, formulation });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

export const deleteFormulation = async (req, res) => {
    try {
        const formulation = await Formulation.findByIdAndDelete(req.params.id);
        if (!formulation) return res.status(404).json({ success: false, message: "Formulation not found" });

        res.json({ success: true, message: "Formulation deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
export const getAllFormulationsOverview = async (req, res) => {
    try {
        const formulationIds = await Product.distinct("formulation", { formulation: { $ne: null } });
        const formulations = await Formulation.find({ _id: { $in: formulationIds } }).sort({ order: 1 });
        res.json({ success: true, formulations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
