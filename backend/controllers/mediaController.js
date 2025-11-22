import Media from "../models/Media.js";

export const uploadVideoController = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No media uploaded" });
        }

        const isVideo = req.file.mimetype.startsWith("video/");

        const {
            title,
            description,
            buttonText
        } = req.body;

        const media = await Media.create({
            type: isVideo ? "video" : "image",
            url: req.file.path,
            publicId: req.file.filename,
            uploadedBy: req.user?._id || null,

            title,
            description,
            buttonText
        });

        return res.status(200).json({
            success: true,
            message: isVideo ? "Video uploaded successfully" : "Image uploaded successfully",
            data: media
        });
    } catch (error) {
        console.error("Media Upload Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ================================
// ⭐ LIST PUBLIC MEDIA
// ================================
export const listPublicMedia = async (req, res) => {
    try {
        const { type, page = 1, limit = 12 } = req.query;

        const filter = {};
        if (type) filter.type = type; // image or video

        const skip = (Number(page) - 1) * Number(limit);

        const [items, total] = await Promise.all([
            Media.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            Media.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            items,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit))
        });
    } catch (error) {
        console.error("Media Fetch Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================
// ⭐ GET MEDIA BY ID
// ================================
export const getMediaById = async (req, res) => {
    try {
        const { id } = req.params;

        const media = await Media.findById(id);
        if (!media) {
            return res.status(404).json({
                success: false,
                message: "Media not found"
            });
        }

        res.status(200).json({
            success: true,
            data: media
        });
    } catch (error) {
        console.error("Get Media Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================
// ⭐ UPDATE MEDIA  
// ================================
export const updateMedia = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            buttonText } = req.body;

        const updateData = {
            title,
            description,
            buttonText
        };

        // If new file is uploaded
        if (req.file) {
            const isVideo = req.file.mimetype.startsWith("video/");
            updateData.type = isVideo ? "video" : "image";
            updateData.url = req.file.path;
            updateData.publicId = req.file.filename;
        }

        const updated = await Media.findByIdAndUpdate(id, updateData, { new: true });

        if (!updated) {
            return res.status(404).json({ success: false, message: "Media not found" });
        }

        res.status(200).json({
            success: true,
            message: "Media updated successfully",
            data: updated
        });
    } catch (error) {
        console.error("Update Media Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================
// ⭐ DELETE MEDIA
// ================================
export const deleteMedia = async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await Media.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Media not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Media deleted successfully",
            data: deleted
        });
    } catch (error) {
        console.error("Delete Media Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};