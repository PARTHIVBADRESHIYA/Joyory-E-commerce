// scripts/migrateShadeOptionsToVariants.js
import mongoose from 'mongoose';
import Product from '../../models/Product.js';
import dotenv from 'dotenv';
dotenv.config();


const migrate = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find();

  for (const product of products) {
    try {
      // ✅ Ensure category is ObjectId
      if (!product.category) {
        console.warn(`⚠️ Skipping product "${product.name}" - no category`);
        continue;
      }

      if (typeof product.category === "string") {
        const categoryDoc = await Category.findOne({ name: product.category });
        if (categoryDoc) {
          product.category = categoryDoc._id;
        } else {
          console.warn(`⚠️ Category not found for "${product.category}" in product "${product.name}"`);
          continue;
        }
      }

      // ✅ Convert shadeOptions → variants
      if (product.shadeOptions && product.shadeOptions.length > 0) {
        product.variants = product.shadeOptions.map(shade => ({
          name: shade.name || shade, // in case shade is a string
          stock: shade.stock || product.quantity || 0,
          price: product.price,
        }));
        product.shadeOptions = undefined; // remove old field
      }

      await product.save();
      console.log(`✅ Migrated: ${product.name}`);
    } catch (err) {
      console.error(`❌ Failed: ${product.name}`, err.message);
    }
  }

  mongoose.connection.close();
};

migrate();
