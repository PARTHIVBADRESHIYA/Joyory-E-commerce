// controllers/attributeController.js
import ProductAttribute from '../models/ProductAttribute.js';

export const createAttribute = async (req, res) => {
    const { name, type, options, categories } = req.body;

    if (!name || !type || !options?.length || !categories?.length) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const attribute = await ProductAttribute.create({
        name, type, options, categories
    });

    // ✅ Populate category names in response
    await attribute.populate("categories", "name");

    res.status(201).json({ message: 'Attribute created', attribute });
};

export const getAllAttributes = async (req, res) => {
    const { category } = req.query;

    let query = { status: 'Active' };
    if (category) {
        query.categories = category; // category id
    }

    const attributes = await ProductAttribute.find(query)
        .populate("categories", "name"); // ✅ only show category name

    res.json(attributes);
};

export const updateAttribute = async (req, res) => {
    const { id } = req.params;
    const { name, type, options, status, categories } = req.body;

    const updated = await ProductAttribute.findByIdAndUpdate(id, {
        name, type, options, status, categories
    }, { new: true });

    res.json({ message: 'Updated', updated });
};

export const deleteAttribute = async (req, res) => {
    const { id } = req.params;
    const deleted = await ProductAttribute.findByIdAndDelete(id);
    res.json({ message: 'Deleted', deleted });
};


export const getAttributesByCategory = async (req, res) => {
    const { category } = req.params;
    if (!category) {
        return res.status(400).json({ message: "Category is required" });
    }

    const attributes = await ProductAttribute.find({
        categories: category,
        status: "Active"
    }).populate("categories", "name");

    res.json(attributes);
};
