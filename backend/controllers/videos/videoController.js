// import slugify from 'slugify';
// import Video from '../../models/Videos/Video.js';
// import { parseVideoSource } from '../../middlewares/utils/parseVideo.js';
// import VideoView from '../../models/Videos/VideoView.js';

// export async function getTrendingVideos(req, res) {
//     try {
//         const days = parseInt(req.query.days || '7');
//         const limit = parseInt(req.query.limit || '10');
//         const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

//         const stats = await VideoView.aggregate([
//             { $match: { createdAt: { $gte: since } } },
//             { $group: { _id: '$video', views: { $sum: 1 } } },
//             { $sort: { views: -1 } },
//             { $limit: limit },
//             {
//                 $lookup: {
//                     from: 'videos',
//                     localField: '_id',
//                     foreignField: '_id',
//                     as: 'video',
//                 },
//             },
//             { $unwind: '$video' },
//             { $project: { _id: 0, video: 1, views: 1 } },
//         ]);

//         res.json(stats);
//     } catch (err) {
//         console.error('getTrendingVideos error:', err);
//         res.status(500).json({ message: 'Internal server error' });
//     }
// }

// export async function createVideo(req, res) {
//     try {
//         const { title, description, category, tags, sourceUrl, status, isPopular, order, publishedAt, uploadedVideo } = req.body;

//         let parsed = {};
//         if (uploadedVideo) {
//             parsed = { provider: 'mp4', videoUrl: uploadedVideo }; // directly from Cloudinary upload
//         } else {
//             parsed = parseVideoSource(sourceUrl); // existing YouTube/Vimeo logic
//         }


//         let slug = slugify(title, { lower: true, strict: true });
//         let base = slug, i = 1;
//         while (await Video.findOne({ slug })) slug = `${base}-${i++}`;

//         const video = await Video.create({
//             title,
//             slug,
//             description,
//             category,
//             tags,
//             ...parsed,
//             status,
//             isPopular,
//             order,
//             publishedAt: status === 'published' ? (publishedAt || new Date()) : null,
//             createdBy: req.user?._id,
//         });

//         res.status(201).json(video);
//     } catch (err) {
//         res.status(400).json({ message: err.message });
//     }
// }

// export async function updateVideo(req, res) {
//     try {
//         const { id } = req.params;
//         const updates = { ...req.body, updatedBy: req.user?._id };

//         if (updates.title) {
//             const slug = slugify(updates.title, { lower: true, strict: true });
//             const exists = await Video.findOne({ slug, _id: { $ne: id } });
//             updates.slug = exists ? `${slug}-${Date.now()}` : slug;
//         }

//         if (updates.sourceUrl) Object.assign(updates, parseVideoSource(updates.sourceUrl));
//         if (updates.status === 'published' && !updates.publishedAt) updates.publishedAt = new Date();

//         const video = await Video.findByIdAndUpdate(id, updates, { new: true });
//         if (!video) return res.status(404).json({ message: 'Not found' });

//         res.json(video);
//     } catch (err) {
//         res.status(400).json({ message: err.message });
//     }
// }

// export async function removeVideo(req, res) {
//     try {
//         const { id } = req.params;
//         const deleted = await Video.findByIdAndDelete(id);
//         if (!deleted) return res.status(404).json({ message: 'Not found' });
//         res.json({ message: 'Deleted successfully' });
//     } catch (err) {
//         res.status(400).json({ message: err.message });
//     }
// }

import slugify from "slugify";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import Video from "../../models/Videos/Video.js";
import { parseVideoSource } from "../../middlewares/utils/parseVideo.js";
import VideoView from "../../models/Videos/VideoView.js";

// ---------- Get Trending ----------
export async function getTrendingVideos(req, res) {
    try {
        const days = parseInt(req.query.days || "7");
        const limit = parseInt(req.query.limit || "10");
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const stats = await VideoView.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: "$video", views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: limit },
            {
                $lookup: {
                    from: "videos",
                    localField: "_id",
                    foreignField: "_id",
                    as: "video",
                },
            },
            { $unwind: "$video" },
            { $project: { _id: 0, video: 1, views: 1 } },
        ]);

        res.json(stats);
    } catch (err) {
        console.error("getTrendingVideos error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

// ---------- Create Video ----------
export async function createVideo(req, res) {
    try {
        const {
            title,
            description,
            category,
            tags,
            sourceUrl,
            status,
            isPopular,
            order,
            publishedAt,
        } = req.body;

        let parsed = {};

        // If file uploaded (local video)
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                resource_type: "video",
                folder: "videos",
            });
            parsed = { provider: "mp4", videoUrl: result.secure_url, cloudPublicId: result.public_id };
        }

        // Else if YouTube/Vimeo link
        else if (sourceUrl) {
            parsed = parseVideoSource(sourceUrl);
        } else {
            return res.status(400).json({ message: "Please upload a video or provide a video URL" });
        }

        let slug = slugify(title, { lower: true, strict: true });
        let base = slug,
            i = 1;
        while (await Video.findOne({ slug })) slug = `${base}-${i++}`;

        const video = await Video.create({
            title,
            slug,
            description,
            category,
            tags,
            ...parsed,
            status,
            isPopular,
            order,
            publishedAt: status === "published" ? publishedAt || new Date() : null,
            createdBy: req.user?._id,
        });

        res.status(201).json(video);
    } catch (err) {
        console.error("Create Video Error:", err);
        res.status(400).json({ message: err.message });
    }
}

// ---------- Update Video ----------
export async function updateVideo(req, res) {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedBy: req.user?._id };

        const existing = await Video.findById(id);
        if (!existing) return res.status(404).json({ message: "Video not found" });

        // Handle local file re-upload (replace existing)
        if (req.file) {
            if (existing.cloudPublicId) {
                try {
                    await cloudinary.uploader.destroy(existing.cloudPublicId, { resource_type: "video" });
                } catch (err) {
                    console.warn("Cloudinary delete failed:", err.message);
                }
            }
            const result = await cloudinary.uploader.upload(req.file.path, {
                resource_type: "video",
                folder: "videos",
            });
            fs.unlinkSync(req.file.path);
            updates.provider = "mp4";
            updates.videoUrl = result.secure_url;
            updates.cloudPublicId = result.public_id;
        } else if (updates.sourceUrl) {
            Object.assign(updates, parseVideoSource(updates.sourceUrl));
        }

        if (updates.title) {
            const slug = slugify(updates.title, { lower: true, strict: true });
            const exists = await Video.findOne({ slug, _id: { $ne: id } });
            updates.slug = exists ? `${slug}-${Date.now()}` : slug;
        }

        if (updates.status === "published" && !updates.publishedAt) {
            updates.publishedAt = new Date();
        }

        const video = await Video.findByIdAndUpdate(id, updates, { new: true });
        res.json(video);
    } catch (err) {
        console.error("Update Video Error:", err);
        res.status(400).json({ message: err.message });
    }
}

// ---------- Remove Video ----------
export async function removeVideo(req, res) {
    try {
        const { id } = req.params;
        const video = await Video.findById(id);
        if (!video) return res.status(404).json({ message: "Not found" });

        if (video.cloudPublicId) {
            await cloudinary.uploader.destroy(video.cloudPublicId, { resource_type: "video" });
        }

        await video.deleteOne();
        res.json({ message: "Deleted successfully" });
    } catch (err) {
        console.error("Remove Video Error:", err);
        res.status(400).json({ message: err.message });
    }
}
