import Tone from "../models/shade/Tone.js";
import Undertone from "../models/shade/Undertone.js";
import ShadeFamily from "../models/shade/Family.js";
import Formulation from "../models/shade/Formulation.js";
import Product from "../models/Product.js";
import { uploadToCloudinary } from "../middlewares/upload.js";
// ----------- TONE CRUD -----------
export const createTone = async (req, res) => {
    try {
        const { key, name, swatchHex } = req.body;

        let heroImages = [];

        if (req.files?.heroImages?.length) {
            for (const file of req.files.heroImages.slice(0, 6)) {
                if (file.buffer) {
                    const result = await uploadToCloudinary(file.buffer, "tones");
                    heroImages.push(typeof result === "string" ? result : result.secure_url);
                }
            }
        }

        const maxTone = await Tone.findOne().sort({ order: -1 }).select("order");
        const nextOrder = maxTone ? maxTone.order + 1 : 1;

        const tone = await Tone.create({
            key, name, order: nextOrder
            , swatchHex, heroImages
        });
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
// export const updateTone = async (req, res) => {
//     try {
//         const update = { ...req.body };

//         if (req.files?.heroImages?.length) {
//             update.heroImages = [];

//             for (const file of req.files.heroImages.slice(0, 6)) {
//                 if (file.buffer) {
//                     const result = await uploadToCloudinary(file.buffer, "tones");
//                     update.heroImages.push(
//                         typeof result === "string" ? result : result.secure_url
//                     );
//                 }
//             }
//         }

//         const tone = await Tone.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!tone) {
//             return res.status(404).json({ success: false, message: "Tone not found" });
//         }

//         res.json({ success: true, tone });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };
export const updateTone = async (req, res) => {
    try {
        const tone = await Tone.findById(req.params.id);
        if (!tone) {
            return res.status(404).json({ success: false, message: "Tone not found" });
        }

        const newOrder = Number(req.body.order);

        // 🔥 ORDER FIX
        if (newOrder && newOrder !== tone.order) {
            if (newOrder > tone.order) {
                await Tone.updateMany(
                    { order: { $gt: tone.order, $lte: newOrder } },
                    { $inc: { order: -1 } }
                );
            } else {
                await Tone.updateMany(
                    { order: { $gte: newOrder, $lt: tone.order } },
                    { $inc: { order: 1 } }
                );
            }
            tone.order = newOrder;
        }

        // Images
        if (req.files?.heroImages?.length) {
            tone.heroImages = [];
            for (const file of req.files.heroImages.slice(0, 6)) {
                const result = await uploadToCloudinary(file.buffer, "tones");
                tone.heroImages.push(typeof result === "string" ? result : result.secure_url);
            }
        }

        // Other fields
        Object.assign(tone, req.body);
        await tone.save();

        res.json({ success: true, tone });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

export const deleteTone = async (req, res) => {
    try {
        const tone = await Tone.findByIdAndDelete(req.params.id);
        if (!tone) return res.status(404).json({ success: false, message: "Tone not found" });

        await Tone.updateMany(
            { order: { $gt: tone.order } },
            { $inc: { order: -1 } }
        );


        res.json({ success: true, message: "Tone deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ----------- UNDERTONE CRUD -----------
export const createUndertone = async (req, res) => {
    try {
        const { key, name, description } = req.body;
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

        const maxUnderTone = await Undertone.findOne().sort({ order: -1 }).select("order");
        const nextOrder = maxUnderTone ? maxUnderTone.order + 1 : 1;

        const undertone = await Undertone.create({
            key, name, order: nextOrder
            , description, image
        });
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
// export const updateUndertone = async (req, res) => {
//     try {
//         const update = { ...req.body };

//         // Upload new image if present
//         if (req.files?.image?.[0]?.buffer) {
//             const result = await uploadToCloudinary(
//                 req.files.image[0].buffer,
//                 "undertones"
//             );

//             update.image = typeof result === "string" ? result : result.secure_url;
//         }
//         const undertone = await Undertone.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!undertone) return res.status(404).json({ success: false, message: "Undertone not found" });
//         res.json({ success: true, undertone });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };

export const updateUndertone = async (req, res) => {
    try {
        const undertone = await Undertone.findById(req.params.id);
        if (!undertone) {
            return res.status(404).json({ success: false, message: "Undertone not found" });
        }

        const newOrder = Number(req.body.order);

        if (newOrder && newOrder !== undertone.order) {
            if (newOrder > undertone.order) {
                await Undertone.updateMany(
                    { order: { $gt: undertone.order, $lte: newOrder } },
                    { $inc: { order: -1 } }
                );
            } else {
                await Undertone.updateMany(
                    { order: { $gte: newOrder, $lt: undertone.order } },
                    { $inc: { order: 1 } }
                );
            }
            undertone.order = newOrder;
        }

        if (req.files?.image?.[0]?.buffer) {
            const result = await uploadToCloudinary(req.files.image[0].buffer, "undertones");
            undertone.image = typeof result === "string" ? result : result.secure_url;
        }

        Object.assign(undertone, req.body);
        await undertone.save();

        res.json({ success: true, undertone });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

export const deleteUndertone = async (req, res) => {
    try {
        const undertone = await Undertone.findByIdAndDelete(req.params.id);
        if (!undertone) return res.status(404).json({ success: false, message: "Undertone not found" });

        await undertone.updateMany(
            { order: { $gt: undertone.order } },
            { $inc: { order: -1 } }
        );

        res.json({ success: true, message: "Undertone deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ----------- SHADE FAMILY CRUD -----------
export const createFamily = async (req, res) => {
    try {
        const { key, name, toneKeys, undertoneKeys, lab } = req.body;
        let sampleImages = "";

        // Upload only if file exists AND has buffer
        if (req.files?.sampleImages?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.sampleImages[0].buffer,
                "shadeFamilies"
            );

            // Accept both string or secure_url
            sampleImages = typeof result === "string" ? result : result.secure_url;
        }


        const maxFamily = await ShadeFamily.findOne().sort({ order: -1 }).select("order");
        const nextOrder = maxFamily ? maxFamily.order + 1 : 1;

        const family = await ShadeFamily.create({
            key, name, toneKeys, undertoneKeys, order: nextOrder
            , sampleImages, lab
        });
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
// export const updateFamily = async (req, res) => {
//     try {
//         const update = { ...req.body };
//         if (req.files?.sampleImages?.length) {
//             update.sampleImages = [];
//             for (const file of req.files.sampleImages.slice(0, 6)) {
//                 if (file.buffer) {
//                     const result = await uploadToCloudinary(file.buffer, "shadeFamilies");
//                     update.sampleImages.push(typeof result === "string" ? result : result.secure_url);
//                 }
//             }
//         }
//         const family = await ShadeFamily.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!family) return res.status(404).json({ success: false, message: "Family not found" });
//         res.json({ success: true, family });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };


export const updateFamily = async (req, res) => {
    try {
        const family = await ShadeFamily.findById(req.params.id);
        if (!family) {
            return res.status(404).json({ success: false, message: "Family not found" });
        }

        const newOrder = Number(req.body.order);

        if (newOrder && newOrder !== family.order) {
            if (newOrder > family.order) {
                await ShadeFamily.updateMany(
                    { order: { $gt: family.order, $lte: newOrder } },
                    { $inc: { order: -1 } }
                );
            } else {
                await ShadeFamily.updateMany(
                    { order: { $gte: newOrder, $lt: family.order } },
                    { $inc: { order: 1 } }
                );
            }
            family.order = newOrder;
        }

        if (req.files?.sampleImages?.[0]?.buffer) {
            const result = await uploadToCloudinary(req.files.sampleImages[0].buffer, "shadeFamilies");
            family.sampleImages = typeof result === "string" ? result : result.secure_url;
        }

        Object.assign(family, req.body);
        await family.save();

        res.json({ success: true, family });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};


export const deleteFamily = async (req, res) => {
    try {
        const family = await ShadeFamily.findByIdAndDelete(req.params.id);
        if (!family) return res.status(404).json({ success: false, message: "Family not found" });

        await family.updateMany(
            { order: { $gt: family.order } },
            { $inc: { order: -1 } }
        );
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
        const { key, name } = req.body;
        let image = null;

        // Upload image to Cloudinary if file exists and has buffer
        if (req.files?.image?.[0]?.buffer) {
            const result = await uploadToCloudinary(req.files.image[0].buffer, "formulations");
            image = typeof result === "string" ? result : result.secure_url;
        }

        const maxFormulation = await Formulation.findOne().sort({ order: -1 }).select("order");
        const nextOrder = maxFormulation ? maxFormulation.order + 1 : 1;

        const formulation = await Formulation.create({
            key, name, order: nextOrder
            , image
        });
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

// export const updateFormulation = async (req, res) => {
//     try {
//         const update = { ...req.body };
//         // Update image only if a new file is uploaded
//         if (req.files?.image?.[0]?.buffer) {
//             const result = await uploadToCloudinary(req.files.image[0].buffer, "formulations");
//             update.image = typeof result === "string" ? result : result.secure_url;
//         }

//         const formulation = await Formulation.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!formulation) return res.status(404).json({ success: false, message: "Formulation not found" });

//         res.json({ success: true, formulation });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };
export const updateFormulation = async (req, res) => {
    try {
        const formulation = await Formulation.findById(req.params.id);
        if (!formulation) {
            return res.status(404).json({ success: false, message: "Formulation not found" });
        }

        const newOrder = Number(req.body.order);

        if (newOrder && newOrder !== formulation.order) {
            if (newOrder > formulation.order) {
                await Formulation.updateMany(
                    { order: { $gt: formulation.order, $lte: newOrder } },
                    { $inc: { order: -1 } }
                );
            } else {
                await Formulation.updateMany(
                    { order: { $gte: newOrder, $lt: formulation.order } },
                    { $inc: { order: 1 } }
                );
            }
            formulation.order = newOrder;
        }

        if (req.files?.image?.[0]?.buffer) {
            const result = await uploadToCloudinary(req.files.image[0].buffer, "formulations");
            formulation.image = typeof result === "string" ? result : result.secure_url;
        }

        Object.assign(formulation, req.body);
        await formulation.save();

        res.json({ success: true, formulation });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

export const deleteFormulation = async (req, res) => {
    try {
        const formulation = await Formulation.findByIdAndDelete(req.params.id);
        if (!formulation) return res.status(404).json({ success: false, message: "Formulation not found" });

        await formulation.updateMany(
            { order: { $gt: formulation.order } },
            { $inc: { order: -1 } }
        );

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
