// migrate_brands.js
import mongoose from 'mongoose';
import Product from '../../models/Product.js';
import Brand from '../../models/Brand.js';

// **VERIFY THIS URI**
const MONGODB_URI = 'mongodb+srv://parthivbadreshiya:parthiv12345@cluster0.silkevx.mongodb.net/joyory?retryWrites=true&w=majority&appName=Cluster0';

// Manual mapping for inconsistent brand names.
// Key: Inconsistent string in Product collection.
// Value: Exact name in Brand collection.
const brandNameMap = {
    "Mamaearth": "Mamaearth",
    "LAKME": "LAKME",
    "MAYBELLINE": "MAYBELLINE",
    "LOREAL PARIS": "LOREAL PARIS",
    // Add any other brand names that are causing errors
    "FAE": "FAE Beauty",
    "Joyory Fragrance": "Joyory Fragrance",
    "Joyory luxe": "Joyory Lux",
    "LuxeBeauty": "Luxe Beauty",
    "Laneige": "Laneige",
    "Nivea": "Nivea",
    "Olay": "Olay",
    "SUGAR": "SUGAR Cosmetics",
    "The Face Shop": "The Face Shop"
};

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB for data migration.');
        try {
            const productsToMigrate = await Product.find({
                brand: { $type: 'string' }
            }).lean();

            if (productsToMigrate.length === 0) {
                console.log('✅ No products with string brand values found. Database is already consistent.');
                return;
            }

            console.log(`Found ${productsToMigrate.length} products to migrate.`);

            for (const product of productsToMigrate) {
                const brandName = product.brand.trim();
                const mappedName = brandNameMap[brandName] || brandName;

                const brandDoc = await Brand.findOne({ name: mappedName });

                if (brandDoc) {
                    await Product.updateOne(
                        { _id: product._id },
                        { $set: { brand: brandDoc._id } }
                    );
                    console.log(`Updated product ${product._id} from "${brandName}" to ObjectId.`);
                } else {
                    console.log(`Brand "${brandName}" not found. Skipping product ${product._id}.`);
                }
            }
            console.log('✨ Migration completed successfully.');
        } catch (error) {
            console.error('❌ Migration failed:', error);
        } finally {
            await mongoose.disconnect();
            console.log('🔌 Disconnected from MongoDB.');
        }
    })
    .catch(err => {
        console.error('❌ Failed to connect to MongoDB:', err);
    });