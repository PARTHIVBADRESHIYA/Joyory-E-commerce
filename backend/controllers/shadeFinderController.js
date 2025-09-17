// import Tone from "../models/shade/Tone.js";
// import Undertone from "../models/shade/Undertone.js";
// import ShadeFamily from "../models/shade/Family.js";
// import Formulation from "../models/shade/Formulation.js";
// import Product from "../models/Product.js";

// // ----------- TONE CRUD -----------
// export const createTone = async (req, res) => {
//     try {
//         const { key, name, order, swatchHex } = req.body;

//         // heroImage upload (single file)
//         const heroImage = req.files?.heroImage?.[0]?.path || null;

//         const tone = await Tone.create({ key, name, order, swatchHex, heroImage });
//         res.status(201).json({ success: true, tone });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };
// export const getTonesAdmin = async (req, res) => {
//     try {
//         const tones = await Tone.find().sort({ order: 1 });
//         res.json({ success: true, tones });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// export const updateTone = async (req, res) => {
//     try {
//         const update = { ...req.body };

//         if (req.files?.heroImage?.[0]) update.heroImage = req.files.heroImage[0].path;

//         const tone = await Tone.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!tone) return res.status(404).json({ success: false, message: "Tone not found" });
//         res.json({ success: true, tone });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };
// export const deleteTone = async (req, res) => {
//     try {
//         const tone = await Tone.findByIdAndDelete(req.params.id);
//         if (!tone) return res.status(404).json({ success: false, message: "Tone not found" });
//         res.json({ success: true, message: "Tone deleted" });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ----------- UNDERTONE CRUD -----------
// export const createUndertone = async (req, res) => {
//     try {
//         const { key, name, order, description } = req.body;

//         // optional hero image / thumbnail for undertone
//         const image = req.files?.image?.[0]?.path || null;

//         const undertone = await Undertone.create({ key, name, order, description, image });
//         res.status(201).json({ success: true, undertone });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };
// export const getUndertonesAdmin = async (req, res) => {
//     try {
//         const undertones = await Undertone.find().sort({ order: 1 });
//         res.json({ success: true, undertones });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
// export const updateUndertone = async (req, res) => {
//     try {
//         const update = { ...req.body };

//         if (req.files?.image?.[0]) update.image = req.files.image[0].path;

//         const undertone = await Undertone.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!undertone) return res.status(404).json({ success: false, message: "Undertone not found" });
//         res.json({ success: true, undertone });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };

// export const deleteUndertone = async (req, res) => {
//     try {
//         const undertone = await Undertone.findByIdAndDelete(req.params.id);
//         if (!undertone) return res.status(404).json({ success: false, message: "Undertone not found" });
//         res.json({ success: true, message: "Undertone deleted" });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ----------- SHADE FAMILY CRUD -----------
// export const createFamily = async (req, res) => {
//     try {
//         const { key, name, toneKeys, undertoneKeys, order, lab } = req.body;

//         // multiple sampleImages upload
//         const sampleImages = req.files?.sampleImages?.map(f => f.path) || [];

//         const family = await ShadeFamily.create({ key, name, toneKeys, undertoneKeys, order, sampleImages, lab });
//         res.status(201).json({ success: true, family });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };


// export const getFamiliesAdmin = async (req, res) => {
//     try {
//         const families = await ShadeFamily.find().sort({ order: 1 });
//         res.json({ success: true, families });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
// export const updateFamily = async (req, res) => {
//     try {
//         const update = { ...req.body };

//         if (req.files?.sampleImages?.length) {
//             update.sampleImages = req.files.sampleImages.map(f => f.path);
//         }

//         const family = await ShadeFamily.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!family) return res.status(404).json({ success: false, message: "Family not found" });
//         res.json({ success: true, family });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };

// export const deleteFamily = async (req, res) => {
//     try {
//         const family = await ShadeFamily.findByIdAndDelete(req.params.id);
//         if (!family) return res.status(404).json({ success: false, message: "Family not found" });
//         res.json({ success: true, message: "Family deleted" });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ----------- ADMIN OVERVIEW (All in one) -----------
// export const getAllShadesAdmin = async (req, res) => {
//     try {
//         const tones = await Tone.find().sort({ order: 1 });
//         const undertones = await Undertone.find().sort({ order: 1 });
//         const families = await ShadeFamily.find().sort({ order: 1 });
//         res.json({ success: true, tones, undertones, families });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ----------- Assign shades to Product (Foundation only) -----------
// export const assignShadesToProduct = async (req, res) => {
//     try {
//         const { productId } = req.params;
//         const { variants } = req.body;
//         // array of { sku, shadeName, familyKey, toneKeys, undertoneKeys, hex, images, price, stock }

//         const product = await Product.findById(productId);
//         if (!product) return res.status(404).json({ success: false, message: "Product not found" });

//         product.variants = variants;
//         await product.save();

//         res.json({ success: true, product });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };



// // ----------- FORMULATION OVERVIEW (Admin) -----------

// // ----------- CREATE -----------
// export const createFormulation = async (req, res) => {
//     try {
//         const { key, name, order } = req.body;
//         const image = req.files?.image?.[0]?.path || null;

//         const formulation = await Formulation.create({ key, name, order, image });
//         res.status(201).json({ success: true, formulation });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };

// // ----------- GET (Admin) -----------
// export const getFormulationsAdmin = async (req, res) => {
//     try {
//         const formulations = await Formulation.find().sort({ order: 1 });
//         res.json({ success: true, formulations });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ----------- UPDATE -----------
// export const updateFormulation = async (req, res) => {
//     try {
//         const update = { ...req.body };
//         if (req.files?.image?.[0]) update.image = req.files.image[0].path;

//         const formulation = await Formulation.findByIdAndUpdate(req.params.id, update, { new: true });
//         if (!formulation) return res.status(404).json({ success: false, message: "Formulation not found" });

//         res.json({ success: true, formulation });
//     } catch (err) {
//         res.status(400).json({ success: false, message: err.message });
//     }
// };

// // ----------- DELETE -----------
// export const deleteFormulation = async (req, res) => {
//     try {
//         const formulation = await Formulation.findByIdAndDelete(req.params.id);
//         if (!formulation) return res.status(404).json({ success: false, message: "Formulation not found" });

//         res.json({ success: true, message: "Formulation deleted" });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ----------- LINK TO PRODUCTS (Overview) -----------
// export const getAllFormulationsOverview = async (req, res) => {
//     try {
//         // Distinct formulation ObjectIds from products
//         const formulationIds = await Product.distinct("formulation", { formulation: { $ne: null } });

//         // Fetch actual formulations by those ids
//         const formulations = await Formulation.find({ _id: { $in: formulationIds } }).sort({ order: 1 });

//         res.json({ success: true, formulations });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
















import Tone from "../models/shade/Tone.js";
import Undertone from "../models/shade/Undertone.js";
import ShadeFamily from "../models/shade/Family.js";
import Formulation from "../models/shade/Formulation.js";
import Product from "../models/Product.js";

// ----------- TONE CRUD -----------
export const createTone = async (req, res) => {
    try {
        const { key, name, order, swatchHex } = req.body;
        const heroImage = req.files?.heroImage?.[0]?.path || null;

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
        if (req.files?.heroImage?.[0]) update.heroImage = req.files.heroImage[0].path;

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
        const image = req.files?.image?.[0]?.path || null;

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
        if (req.files?.image?.[0]) update.image = req.files.image[0].path;

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
        const sampleImages = req.files?.sampleImages?.map(f => f.path) || [];

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
        if (req.files?.sampleImages?.length) update.sampleImages = req.files.sampleImages.map(f => f.path);

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
        const image = req.files?.image?.[0]?.path || null;

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
        if (req.files?.image?.[0]) update.image = req.files.image[0].path;

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
