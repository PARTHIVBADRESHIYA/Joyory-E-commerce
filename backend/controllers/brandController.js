// controllers/admin/brandAdminController.js
import Brand from "../models/Brand.js";
import { toSlug } from "../middlewares/utils/slug.js";
import { uploadToCloudinary } from "../middlewares/upload.js";

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


        let logo = "";
        let banner = "";

        // 🔥 Upload LOGO
        if (req.files?.logo?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.logo[0].buffer,
                "brands/logo"
            );

            logo = typeof result === "string" ? result : result.secure_url;
        }

        // 🔥 Upload BANNER
        if (req.files?.banner?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.banner[0].buffer,
                "brands/banner"
            );

            banner = typeof result === "string" ? result : result.secure_url;
        }

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

        // ---------- CLOUDINARY UPLOADS ----------
        if (req.files?.logo?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.logo[0].buffer,
                "brands/logo"
            );
            update.logo = typeof result === "string" ? result : result.secure_url;
        }

        if (req.files?.banner?.[0]?.buffer) {
            const result = await uploadToCloudinary(
                req.files.banner[0].buffer,
                "brands/banner"
            );
            update.banner = typeof result === "string" ? result : result.secure_url;
        }

        const brand = await Brand.findByIdAndUpdate(id, update, { new: true });
        if (!brand)
            return res.status(404).json({ message: "Brand not found" });

        res.json({ message: "Brand updated", brand });
    } catch (err) {
        res.status(500).json({ message: "Failed to update brand", error: err.message });
    }
};

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

export const getAllBrandsAdmin = async (req, res) => {
    try {
        const brands = await Brand.find().sort({ createdAt: -1 });
        res.json(brands);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch brands", error: err.message });
    }
};
