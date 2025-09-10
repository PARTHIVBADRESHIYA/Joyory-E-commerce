import mongoose from "mongoose";
import GiftCardTemplate from "../models/GiftCardTemplate.js";

// ✅ Create template
export const createGiftCardTemplate = async (req, res) => {
    try {
        const { title, description, minAmount, maxAmount,tag } = req.body;
        const image = req.file ? req.file.path : null;

        if (!title || !description || !image || !tag) {
            return res.status(400).json({ message: "Title, description,tag  and image are required" });
        }

        const template = new GiftCardTemplate({
            title,
            description,
            image,
            tag,
            minAmount,
            maxAmount
        });

        await template.save();
        res.status(201).json({ message: "Gift card template created", template });
    } catch (err) {
        res.status(500).json({ message: "Failed to create template", error: err.message });
    }
};

// ✅ Get all templates
export const getAllGiftCardTemplates = async (req, res) => {
    try {
        const templates = await GiftCardTemplate.find().sort({ createdAt: -1 });
        res.json(templates);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch templates", error: err.message });
    }
};

// ✅ Update template
export const updateGiftCardTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        if (req.file) {
            updateData.image = req.file.path;
        }

        const template = await GiftCardTemplate.findByIdAndUpdate(id, updateData, { new: true });
        if (!template) return res.status(404).json({ message: "Template not found" });

        res.json({ message: "Template updated", template });
    } catch (err) {
        res.status(500).json({ message: "Failed to update template", error: err.message });
    }
};

// ✅ Delete template
export const deleteGiftCardTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await GiftCardTemplate.findByIdAndDelete(id);
        if (!template) return res.status(404).json({ message: "Template not found" });

        res.json({ message: "Template deleted" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete template", error: err.message });
    }
};
