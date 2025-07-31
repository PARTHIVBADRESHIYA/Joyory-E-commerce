// controllers/attributeController.js
import ProductAttribute from '../models/ProductAttribute.js';

export const createAttribute = async (req, res) => {
    const { name, type, options } = req.body;
    if (!name || !type || !options?.length) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const attribute = await ProductAttribute.create({
        name, type, options,
    });

    res.status(201).json({ message: 'Attribute created', attribute });
};

export const getAllAttributes = async (req, res) => {
    const attributes = await ProductAttribute.find({ status: 'Active' });
    res.json(attributes);
};

export const updateAttribute = async (req, res) => {
    const { id } = req.params;
    const { name, type, options, status } = req.body;

    const updated = await ProductAttribute.findByIdAndUpdate(id, {
        name, type, options, status
    }, { new: true });

    res.json({ message: 'Updated', updated });
};

export const deleteAttribute = async (req, res) => {
    const { id } = req.params;
    const deleted = await ProductAttribute.findByIdAndDelete(id);
    res.json({ message: 'Deleted', deleted });
};
