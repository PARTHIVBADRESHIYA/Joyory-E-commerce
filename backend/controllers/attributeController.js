// // controllers/attributeController.js
// import ProductAttribute from '../models/ProductAttribute.js';

// /* ---------- CREATE ---------- */
// export const createAttribute = async (req, res) => {
//     const { name, type, options, categories } = req.body;

//     if (!name || !type || !options?.length || !categories?.length) {
//         return res.status(400).json({ message: "Missing required fields" });
//     }

//     const attribute = await ProductAttribute.create({
//         name,
//         type,
//         options,
//         categories,
//         status: "Active", // ✅ default status
//     });

//     await attribute.populate("categories", "name");

//     res.status(201).json({ message: "Attribute created", attribute });
// };

// /* ---------- GET ALL (Active + Inactive) ---------- */
// export const getAllAttributes = async (req, res) => {
//     const { category } = req.query;

//     const query = {}; // ✅ no status filter, fetch everything
//     if (category) {
//         query.categories = category;
//     }

//     const attributes = await ProductAttribute.find(query)
//         .populate("categories", "name")
//         .sort({ createdAt: -1 });

//     res.json(attributes);
// };

// /* ---------- UPDATE ---------- */
// export const updateAttribute = async (req, res) => {
//     const { id } = req.params;
//     const { name, type, options, status, categories } = req.body;

//     const updated = await ProductAttribute.findByIdAndUpdate(
//         id,
//         { name, type, options, status, categories },
//         { new: true }
//     ).populate("categories", "name");

//     if (!updated) {
//         return res.status(404).json({ message: "Attribute not found" });
//     }

//     res.json({ message: "Updated", updated });
// };

// /* ---------- HARD DELETE (Permanent) ---------- */
// export const deleteAttribute = async (req, res) => {
//     const { id } = req.params;

//     const deleted = await ProductAttribute.findByIdAndDelete(id);

//     if (!deleted) {
//         return res.status(404).json({ message: "Attribute not found" });
//     }

//     res.json({ message: "Deleted permanently", deleted });
// };

// /* ---------- GET BY CATEGORY (Active only) ---------- */
// export const getAttributesByCategory = async (req, res) => {
//     const { category } = req.params;
//     if (!category) {
//         return res.status(400).json({ message: "Category is required" });
//     }

//     const attributes = await ProductAttribute.find({
//         categories: category,
//         status: "Active",
//     }).populate("categories", "name");

//     res.json(attributes);
// };























import ProductAttribute from '../models/ProductAttribute.js';

/* ---------- CREATE ---------- */
export const createAttribute = async (req, res) => {
    const { name, type, categoryOptions } = req.body;

    if (!name || !type || !categoryOptions?.length) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const attribute = await ProductAttribute.create({
        name,
        type,
        categoryOptions,
        status: "Active"
    });

    await attribute.populate("categoryOptions.category", "name");

    res.status(201).json({ message: "Attribute created", attribute });
};

/* ---------- GET ALL (Active + Inactive) ---------- */
export const getAllAttributes = async (req, res) => {
    const attributes = await ProductAttribute.find()
        .populate("categoryOptions.category", "name")
        .sort({ createdAt: -1 });

    res.json(attributes);
};

/* ---------- UPDATE ---------- */
export const updateAttribute = async (req, res) => {
    const { id } = req.params;
    const { name, type, status, categoryOptions } = req.body;

    const updated = await ProductAttribute.findByIdAndUpdate(
        id,
        { name, type, status, categoryOptions },
        { new: true }
    ).populate("categoryOptions.category", "name");

    if (!updated) {
        return res.status(404).json({ message: "Attribute not found" });
    }

    res.json({ message: "Updated", updated });
};

/* ---------- HARD DELETE (Permanent) ---------- */
export const deleteAttribute = async (req, res) => {
    const { id } = req.params;
    const deleted = await ProductAttribute.findByIdAndDelete(id);

    if (!deleted) {
        return res.status(404).json({ message: "Attribute not found" });
    }

    res.json({ message: "Deleted permanently", deleted });
};

/* ---------- GET BY CATEGORY (Active only) ---------- */
// export const getAttributesByCategory = async (req, res) => {
//     const { category } = req.params;
//     if (!category) {
//         return res.status(400).json({ message: "Category is required" });
//     }

//     const attributes = await ProductAttribute.find({
//         status: "Active",
//         "categoryOptions.category": category
//     }).populate("categoryOptions.category", "name");

//     // ✅ filter only the options for this category
//     const filtered = attributes.map(attr => {
//         const catData = attr.categoryOptions.find(co => co.category.toString() === category);
//         return {
//             id: attr._id,
//             name: attr.name,
//             type: attr.type,
//             options: catData?.options || [],
//             category: catData?.category
//         };
//     });

//     res.json(filtered);
// };



export const getAttributesByCategory = async (req, res) => {
    const { category } = req.params;
    if (!category) return res.status(400).json({ message: "Category is required" });

    const attributes = await ProductAttribute.find({
        status: "Active",
        "categoryOptions.category": category
    }).populate("categoryOptions.category", "name");

    const filtered = attributes.map(attr => {
        const catData = attr.categoryOptions.find(co => co.category._id.toString() === category);
        return {
            id: attr._id,
            name: attr.name,
            type: attr.type,
            options: catData?.options || [],
            category: catData?.category
        };
    });

    res.json(filtered);
};
