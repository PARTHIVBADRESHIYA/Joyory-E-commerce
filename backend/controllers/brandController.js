// controllers/admin/brandAdminController.js
import Brand from "../models/Brand.js";
import { toSlug } from "../middlewares/utils/slug.js";

/**
 * Create new brand
 */
// export const createBrand = async (req, res) => {
//     try {
//         const { name, description } = req.body;

//         const slug = toSlug(name);
//         const existing = await Brand.findOne({ slug });
//         if (existing) return res.status(400).json({ message: "Brand already exists" });

//         const logo = req.files?.logo?.[0]?.path || null;
//         const banner = req.files?.banner?.[0]?.path || null;

//         const brand = await Brand.create({ name, slug, description, logo, banner });
//         res.status(201).json({ message: "Brand created", brand });
//     } catch (err) {
//         res.status(500).json({ message: "Failed to create brand", error: err.message });
//     }
// };


/**
 * Create new brand
 */
export const createBrand = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Brand name is required" });
        }

        const slug = toSlug(name);
        const existing = await Brand.findOne({ slug });
        if (existing) {
            return res.status(400).json({ message: "Brand already exists" });
        }

        const logo = req.files?.logo?.[0]?.path || null;
        const banner = req.files?.banner?.[0]?.path || null;

        // Warehouses can come as:
        // - raw JSON
        // - text string (multipart/form-data)
        // - empty (so we create default)
        let parsedWarehouses = [];

        if (req.body.warehouses) {
            try {
                // If warehouses is a string, parse it
                if (typeof req.body.warehouses === "string") {
                    parsedWarehouses = JSON.parse(req.body.warehouses);
                } else {
                    // Already JSON (raw body)
                    parsedWarehouses = req.body.warehouses;
                }
            } catch (err) {
                return res.status(400).json({
                    message: "Invalid warehouses JSON format",
                    error: err.message,
                });
            }
        }

        // Validate & format warehouses
        if (Array.isArray(parsedWarehouses) && parsedWarehouses.length > 0) {
            parsedWarehouses = parsedWarehouses.map((w, index) => ({
                name: w.name || w.label || `${name} Warehouse ${index + 1}`, // FIXED
                code: w.code || `${slug}_WH_${index + 1}`,
                address: w.address || "",
                isActive: w.isActive !== undefined ? w.isActive : true,
            }));
        } else {
            // Auto-create default warehouse
            parsedWarehouses = [
                {
                    name: `${name} Default Warehouse`, // FIXED
                    code: `${slug}_WH_1`,
                    address: "",
                    isActive: true,
                },
            ];
        }

        const brand = await Brand.create({
            name,
            slug,
            description,
            logo,
            banner,
            warehouses: parsedWarehouses,
            primaryWarehouse: parsedWarehouses[0].code,
        });

        res.status(201).json({ message: "Brand created", brand });
    } catch (err) {
        res.status(500).json({
            message: "Failed to create brand",
            error: err.message,
        });
    }
};


/**
 * Update brand
 */
// export const updateBrand = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { name, description, isActive } = req.body;

//         const update = {};
//         if (name) {
//             update.name = name;
//             update.slug = toSlug(name);
//         }
//         if (description !== undefined) update.description = description;
//         if (isActive !== undefined) update.isActive = isActive;

//         if (req.files?.logo?.[0]) update.logo = req.files.logo[0].path;
//         if (req.files?.banner?.[0]) update.banner = req.files.banner[0].path;

//         const brand = await Brand.findByIdAndUpdate(id, update, { new: true });
//         if (!brand) return res.status(404).json({ message: "Brand not found" });

//         res.json({ message: "Brand updated", brand });
//     } catch (err) {
//         res.status(500).json({ message: "Failed to update brand", error: err.message });
//     }
// };
export const updateBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isActive, warehouses, primaryWarehouse } = req.body;

        const update = {};

        if (name) {
            const slug = toSlug(name);
            update.name = name;
            update.slug = slug;
        }

        if (description !== undefined) update.description = description;
        if (isActive !== undefined) update.isActive = isActive;

        // Handle warehouses update
        if (warehouses) {
            let parsedWarehouses = warehouses; // ← no JSON.parse()

            // Ensure array
            if (!Array.isArray(parsedWarehouses)) {
                return res.status(400).json({
                    message: "warehouses must be an array"
                });
            }

            update.warehouses = parsedWarehouses.map((w, index) => ({
                _id: w._id || undefined,
                label: w.label || "",
                code: w.code || `${toSlug(name || brand.name)}_WH_${index + 1}`,
                address: w.address || "",
                isActive: w.isActive !== undefined ? w.isActive : true
            }));
        }

        // Set primary warehouse
        if (primaryWarehouse) {
            update.primaryWarehouse = primaryWarehouse;
        }

        if (req.files?.logo?.[0]) update.logo = req.files.logo[0].path;
        if (req.files?.banner?.[0]) update.banner = req.files.banner[0].path;

        const brand = await Brand.findByIdAndUpdate(id, update, { new: true });
        if (!brand)
            return res.status(404).json({ message: "Brand not found" });

        res.json({ message: "Brand updated", brand });
    } catch (err) {
        res.status(500).json({ message: "Failed to update brand", error: err.message });
    }
};

/**
 * Delete brand
 */

export const deleteBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const brand = await Brand.findByIdAndDelete(id);
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        res.json({ message: "Brand deleted" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete brand", error: err.message });
    }
};

/**
 * Get all brands (admin)
 */
export const getAllBrandsAdmin = async (req, res) => {
    try {
        const brands = await Brand.find().sort({ createdAt: -1 });
        res.json(brands);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch brands", error: err.message });
    }
};
