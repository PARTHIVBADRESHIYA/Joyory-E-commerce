// migrations/updateProductAttributes.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../../models/Product.js";

dotenv.config();

// ✅ category attribute definitions
const categoryAttributesMap = {
    // LipCare
    "689b14caee29d13d113eb871": [
        { key: "flavor", label: "Flavor", type: "string" },
        { key: "spf", label: "SPF", type: "number" },
        { key: "finish", label: "Finish", type: "string" }
    ],
    LipCare: [
        { key: "flavor", label: "Flavor", type: "string" },
        { key: "spf", label: "SPF", type: "number" },
        { key: "finish", label: "Finish", type: "string" }
    ],

    // LipBalm
    "689b14ecee29d13d113eb877": [
        { key: "flavor", label: "Flavor", type: "string" },
        { key: "spf", label: "SPF", type: "number" },
        { key: "finish", label: "Finish", type: "string" }
    ],
    LipBalm: [
        { key: "flavor", label: "Flavor", type: "string" },
        { key: "spf", label: "SPF", type: "number" },
        { key: "finish", label: "Finish", type: "string" }
    ],

    // LipMask
    "689b15d5ee29d13d113eb880": [
        { key: "treatment", label: "Treatment", type: "string" },
        { key: "duration", label: "Duration", type: "string" }
    ],
    LipMask: [
        { key: "treatment", label: "Treatment", type: "string" },
        { key: "duration", label: "Duration", type: "string" }
    ],

    // FaceCare
    "689b14a6ee29d13d113eb86b": [
        { key: "skinType", label: "Skin Type", type: "string" },
        { key: "concern", label: "Skin Concern", type: "string" },
        { key: "spf", label: "SPF", type: "number" }
    ],
    FaceCare: [
        { key: "skinType", label: "Skin Type", type: "string" },
        { key: "concern", label: "Skin Concern", type: "string" },
        { key: "spf", label: "SPF", type: "number" }
    ],

    // EyeCare
    "689b16afb2a63c5f3a099c81": [
        { key: "concern", label: "Concern", type: "string" },
        { key: "formulation", label: "Formulation", type: "string" }
    ],
    EyeCare: [
        { key: "concern", label: "Concern", type: "string" },
        { key: "formulation", label: "Formulation", type: "string" }
    ],

    // Eyeliner
    "689b07c6fcf28b426c12c124": [
        { key: "color", label: "Color", type: "string" },
        { key: "finish", label: "Finish", type: "string" },
        { key: "waterproof", label: "Waterproof", type: "boolean" }
    ],
    Eyeliner: [
        { key: "color", label: "Color", type: "string" },
        { key: "finish", label: "Finish", type: "string" },
        { key: "waterproof", label: "Waterproof", type: "boolean" }
    ],

    // HairCare
    "689c847c0a551677c83cc78f": [
        { key: "hairType", label: "Hair Type", type: "string" },
        { key: "concern", label: "Hair Concern", type: "string" },
        { key: "sulfateFree", label: "Sulfate Free", type: "boolean" }
    ],
    HairCare: [
        { key: "hairType", label: "Hair Type", type: "string" },
        { key: "concern", label: "Hair Concern", type: "string" },
        { key: "sulfateFree", label: "Sulfate Free", type: "boolean" }
    ],

    // Fragrance
    "68a4019fd0364da9d3d9bab7": [
        { key: "fragranceType", label: "Fragrance Type", type: "string" },
        { key: "notes", label: "Notes", type: "string" },
        { key: "longLasting", label: "Long Lasting", type: "boolean" }
    ],
    Fragrance: [
        { key: "fragranceType", label: "Fragrance Type", type: "string" },
        { key: "notes", label: "Notes", type: "string" },
        { key: "longLasting", label: "Long Lasting", type: "boolean" }
    ]
};

const runMigration = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB connected for migration");

        const products = await Product.find({});
        console.log(`🔎 Found ${products.length} products`);

        let updatedCount = 0;

        for (const product of products) {
            const categoryKey = product.category?.toString();
            const categoryName = typeof product.category === "string" ? product.category : null;

            const attrs =
                categoryAttributesMap[categoryKey] ||
                categoryAttributesMap[categoryName];

            if (attrs) {
                await Product.updateOne(
                    { _id: product._id },
                    {
                        $set: { attributes: {} },
                        $unset: { shadeOptions: "", colorOptions: "" }
                    }
                );
                updatedCount++;
            }
        }

        console.log(`✅ Migration complete: ${updatedCount} products updated`);
        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB");
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
