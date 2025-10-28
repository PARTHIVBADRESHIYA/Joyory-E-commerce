import Media from "../models/Media.js";

export const uploadVideoController = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No media uploaded" });
        }

        const isVideo = req.file.mimetype.startsWith("video/");

        const media = await Media.create({
            type: isVideo ? "video" : "image",
            url: req.file.path,
            publicId: req.file.filename,
            uploadedBy: req.user?._id || null,
        });

        return res.status(200).json({
            success: true,
            message: isVideo ? "Video uploaded successfully" : "Image uploaded successfully",
            data: media,
        });
    } catch (error) {
        console.error("Media Upload Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};


export const listPublicMedia = async (req, res) => {
    try {
        const { type, page = 1, limit = 12 } = req.query;
        const filter = {};

        if (type) filter.type = type; // optional filter: image or video

        const skip = (Number(page) - 1) * Number(limit);

        const [items, total] = await Promise.all([
            Media.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
            Media.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            items,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
        });
    } catch (error) {
        console.error("Media Fetch Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};