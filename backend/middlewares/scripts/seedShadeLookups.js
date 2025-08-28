// scripts/seedShadeLookups.js
import mongoose from 'mongoose';
import Tone from '../../models/shade/Tone.js';
import Undertone from '../../models/shade/Undertone.js';
import ShadeFamily from '../../models/shade/Family.js';
import dotenv from 'dotenv';
dotenv.config();

const seed = async () => {
    await mongoose.connect(process.env.MONGO_URI);

    await Tone.deleteMany({});
    await Undertone.deleteMany({});
    await ShadeFamily.deleteMany({});

    await Tone.insertMany([
        { key: "fair", name: "Fair", order: 1, swatchHex: "#F2D8C5" },
        { key: "light", name: "Light", order: 2, swatchHex: "#E9C4A8" },
        { key: "light-medium", name: "Light Medium", order: 3 },
        { key: "medium", name: "Medium", order: 4 },
        { key: "medium-deep", name: "Medium Deep", order: 5 },
        { key: "deep", name: "Deep", order: 6 }
    ]);

    await Undertone.insertMany([
        { key: "cool", name: "Cool" },
        { key: "neutral", name: "Neutral" },
        { key: "warm", name: "Warm" },
        { key: "olive", name: "Olive" }
    ]);

    await ShadeFamily.insertMany([
        { key: "ivory-pink", name: "Ivory Pink", toneKeys: ["fair", "light"], undertoneKeys: ["cool", "neutral"] },
        { key: "beige", name: "Beige", toneKeys: ["light", "light-medium", "medium"], undertoneKeys: ["neutral", "warm"] },
        { key: "tan", name: "Tan", toneKeys: ["medium", "medium-deep"], undertoneKeys: ["warm", "olive"] }
    ]);

    console.log("Seeded shade lookups.");
    process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
