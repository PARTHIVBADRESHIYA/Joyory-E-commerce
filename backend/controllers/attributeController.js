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

    res.status(201).json({ message: 'Attribute created', attribute });
};

export const getAllAttributes = async (req, res) => {
    const { category } = req.query;

    let query = { status: 'Active' };

    // 🆕 Filter by category if provided
    if (category) {
        query.categories = category;
    }

    const attributes = await ProductAttribute.find(query);
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
