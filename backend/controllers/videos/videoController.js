import slugify from "slugify";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import Video from "../../models/Videos/Video.js";
import { parseVideoSource } from "../../middlewares/utils/parseVideo.js";
import VideoView from "../../models/Videos/VideoView.js";
import { uploadBufferToCloudinary } from '../../middlewares/utils/cloudinary.js';
import { uploadToCloudinary } from '../../middlewares/upload.js';
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

// ---------- Get All Videos ----------
export async function getAllVideos(req, res) {
    try {
        // Optional query filters (like status or category)
        const { status, category } = req.query;
        const filter = {};

        if (status && status !== "all") filter.status = status;
        if (category && category !== "all") filter.category = category;

        const videos = await Video.find(filter)
            .sort({ createdAt: -1 }) // newest first
            .select("_id title slug description videoUrl thumbnail provider status createdAt updatedAt")
            .lean();

        res.json({
            success: true,
            count: videos.length,
            videos,
        });
    } catch (err) {
        console.error("Get All Videos Error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

// ---------- Create Video ----------
// export async function createVideo(req, res) {
//     try {
//         const {
//             title,
//             description,
//             category,
//             tags,
//             sourceUrl,
//             status,
//             isPopular,
//             order,
//             publishedAt,
//             thumbnailUrl, // ✅ new optional field
//         } = req.body;

//         let parsed = {};

//         // ✅ new
//         if (req.files && req.files.video && req.files.video.length > 0) {
//             const videoFile = req.files.video[0];
//             const result = await cloudinary.uploader.upload(videoFile.path, {
//                 resource_type: "video",
//                 folder: "videos",
//             });
//             parsed = { provider: "mp4", videoUrl: result.secure_url, cloudPublicId: result.public_id };
//         } else if (sourceUrl) {
//             parsed = parseVideoSource(sourceUrl);
//         } else {
//             return res.status(400).json({ message: "Please upload a video or provide a video URL" });
//         }

//         // ✅ 2. Handle thumbnail (either local file or URL)
//         let thumbnail = {};
//         if (req.files && req.files.thumbnail) {
//             const thumbFile = req.files.thumbnail[0];
//             const thumbUpload = await cloudinary.uploader.upload(thumbFile.path, {
//                 folder: "thumbnails",
//                 resource_type: "image",
//             });
//             fs.unlinkSync(thumbFile.path);
//             thumbnail = { url: thumbUpload.secure_url, publicId: thumbUpload.public_id };
//         } else if (thumbnailUrl) {
//             thumbnail = { url: thumbnailUrl };
//         }

//         // ✅ 3. Create slug
//         let slug = slugify(title, { lower: true, strict: true });
//         let base = slug, i = 1;
//         while (await Video.findOne({ slug })) slug = `${base}-${i++}`;

//         // ✅ 4. Create video
//         const video = await Video.create({
//             title,
//             slug,
//             description,
//             category,
//             tags,
//             ...parsed,
//             thumbnail,
//             status,
//             isPopular,
//             order,
//             publishedAt: status === "published" ? publishedAt || new Date() : null,
//             createdBy: req.user?._id,
//         });

//         res.status(201).json(video);
//     } catch (err) {
//         console.error("Create Video Error:", err);
//         res.status(400).json({ message: err.message });
//     }
// }

// // ---------- Update Video ----------
// export async function updateVideo(req, res) {
//     try {
//         const { id } = req.params;
//         const updates = { ...req.body, updatedBy: req.user?._id };

//         const existing = await Video.findById(id);
//         if (!existing) return res.status(404).json({ message: "Video not found" });

//         // ✅ Handle video re-upload
//         if (req.files && req.files.video) {
//             const videoFile = req.files.video[0];

//             // Delete old cloud video
//             if (existing.cloudPublicId) {
//                 try {
//                     await cloudinary.uploader.destroy(existing.cloudPublicId, { resource_type: "video" });
//                 } catch (err) {
//                     console.warn("Cloudinary delete failed:", err.message);
//                 }
//             }

//             const result = await cloudinary.uploader.upload(videoFile.path, {
//                 resource_type: "video",
//                 folder: "videos",
//             });

//             // ✅ Only unlink if it’s a real local file
//             if (videoFile.path && !videoFile.path.startsWith("http")) {
//                 try { fs.unlinkSync(videoFile.path); } catch { }
//             }

//             updates.provider = "mp4";
//             updates.videoUrl = result.secure_url;
//             updates.cloudPublicId = result.public_id;
//         } else if (updates.sourceUrl) {
//             Object.assign(updates, parseVideoSource(updates.sourceUrl));
//         }

//         // ✅ Handle thumbnail update
//         if (req.files && req.files.thumbnail) {
//             const thumbFile = req.files.thumbnail[0];

//             // delete old one
//             if (existing.thumbnail?.publicId) {
//                 try {
//                     await cloudinary.uploader.destroy(existing.thumbnail.publicId, { resource_type: "image" });
//                 } catch (err) {
//                     console.warn("Thumbnail delete failed:", err.message);
//                 }
//             }

//             const thumbUpload = await cloudinary.uploader.upload(thumbFile.path, {
//                 folder: "thumbnails",
//                 resource_type: "image",
//             });

//             // ✅ Only unlink if local
//             if (thumbFile.path && !thumbFile.path.startsWith("http")) {
//                 try { fs.unlinkSync(thumbFile.path); } catch { }
//             }

//             updates.thumbnail = { url: thumbUpload.secure_url, publicId: thumbUpload.public_id };
//         } else if (updates.thumbnailUrl) {
//             updates.thumbnail = { url: updates.thumbnailUrl };
//         }

//         // ✅ Slug update
//         if (updates.title) {
//             const slug = slugify(updates.title, { lower: true, strict: true });
//             const exists = await Video.findOne({ slug, _id: { $ne: id } });
//             updates.slug = exists ? `${slug}-${Date.now()}` : slug;
//         }

//         // ✅ Publish date
//         if (updates.status === "published" && !updates.publishedAt) {
//             updates.publishedAt = new Date();
//         }

//         const video = await Video.findByIdAndUpdate(id, updates, { new: true });
//         res.json(video);
//     } catch (err) {
//         console.error("Update Video Error:", err);
//         res.status(400).json({ message: err.message });
//     }
// }

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
            thumbnailUrl,
        } = req.body;

        let parsed = {};

        // ✅ Upload video to cloudinary
        if (req.files?.video?.length) {
            const videoFile = req.files.video[0];
            const result = await uploadToCloudinary(videoFile.buffer, "videos", "video");
            parsed = { provider: "mp4", videoUrl: result.secure_url, cloudPublicId: result.public_id };
        } else if (sourceUrl) {
            parsed = parseVideoSource(sourceUrl);
        } else {
            return res.status(400).json({ message: "Please upload a video or provide a video URL" });
        }

        // ✅ Upload thumbnail to cloudinary
        let thumbnail = {};
        if (req.files?.thumbnail?.length) {
            const thumbFile = req.files.thumbnail[0];
            const thumbResult = await uploadToCloudinary(thumbFile.buffer, "thumbnails", "image");
            thumbnail = { url: thumbResult.secure_url, publicId: thumbResult.public_id };
        } else if (thumbnailUrl) {
            thumbnail = { url: thumbnailUrl };
        }

        // ✅ Create slug
        let slug = slugify(title, { lower: true, strict: true });
        let base = slug, i = 1;
        while (await Video.findOne({ slug })) slug = `${base}-${i++}`;

        // ✅ Create Video
        const video = await Video.create({
            title,
            slug,
            description,
            category,
            tags,
            ...parsed,
            thumbnail,
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
// ---------- Update Video ----------
export async function updateVideo(req, res) {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedBy: req.user?._id };

        const existing = await Video.findById(id);
        if (!existing) return res.status(404).json({ message: "Video not found" });

        // ------------------ Video upload ------------------
        if (req.files?.video?.length) {
            const videoFile = req.files.video[0];

            // delete old video from Cloudinary
            if (existing.cloudPublicId) {
                try {
                    await cloudinary.uploader.destroy(existing.cloudPublicId, { resource_type: "video" });
                } catch (err) {
                    console.warn("Cloudinary delete failed:", err.message);
                }
            }

            // upload new video
            const result = await uploadToCloudinary(videoFile.buffer, "videos", "video");
            updates.provider = "mp4";
            updates.videoUrl = result.secure_url;
            updates.cloudPublicId = result.public_id;
        } else if (updates.sourceUrl) {
            Object.assign(updates, parseVideoSource(updates.sourceUrl));
        }

        // ------------------ Thumbnail upload ------------------
        let thumbnail = {};
        if (req.files?.thumbnail?.length) {
            const thumbFile = req.files.thumbnail[0];

            // delete old thumbnail
            if (existing.thumbnail?.publicId) {
                try {
                    await cloudinary.uploader.destroy(existing.thumbnail.publicId, { resource_type: "image" });
                } catch (err) {
                    console.warn("Thumbnail delete failed:", err.message);
                }
            }

            // upload new thumbnail
            const thumbResult = await uploadToCloudinary(thumbFile.buffer, "thumbnails", "image");
            thumbnail = { url: thumbResult.secure_url, publicId: thumbResult.public_id };
        } else if (updates.thumbnailUrl) {
            thumbnail = { url: updates.thumbnailUrl };
        }

        if (Object.keys(thumbnail).length) updates.thumbnail = thumbnail;

        // ------------------ Slug update ------------------
        if (updates.title) {
            let slug = slugify(updates.title, { lower: true, strict: true });
            let base = slug, i = 1;
            while (await Video.findOne({ slug, _id: { $ne: id } })) slug = `${base}-${i++}`;
            updates.slug = slug;
        }

        // ------------------ Publish date ------------------
        if (updates.status === "published" && !updates.publishedAt) {
            updates.publishedAt = new Date();
        }

        // ------------------ Update document ------------------
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
