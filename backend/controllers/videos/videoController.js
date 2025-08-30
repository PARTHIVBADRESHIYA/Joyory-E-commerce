import slugify from 'slugify';
import Video from '../../models/Videos/Video.js';
import { parseVideoSource } from '../../middlewares/utils/parseVideo.js';



import crypto from 'crypto';
import VideoView from '../../models/Videos/VideoView.js';




/**
 * Get trending videos based on views in last X days
 * @query days = number of days (default: 7)
 * @query limit = number of results (default: 10)
 */
export async function getTrendingVideos(req, res) {
    try {
        const days = parseInt(req.query.days || '7');
        const limit = parseInt(req.query.limit || '10');

        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Aggregate views in last X days
        const stats = await VideoView.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: '$video',
                    views: { $sum: 1 },
                },
            },
            { $sort: { views: -1 } },
            { $limit: limit },
            {
                $lookup: {
                    from: 'videos',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'video',
                },
            },
            { $unwind: '$video' },
            {
                $project: {
                    _id: 0,
                    video: 1,
                    views: 1,
                },
            },
        ]);

        res.json(stats);
    } catch (err) {
        console.error('getTrendingVideos error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}


export async function createVideo(req, res) {
    try {
        const { title, description, category, tags, sourceUrl, status, isPopular, order, publishedAt } = req.body;


        const parsed = parseVideoSource(sourceUrl);
        let slug = slugify(title, { lower: true, strict: true });
        // ensure unique
        let base = slug, i = 1;
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
            publishedAt: status === 'published' ? (publishedAt || new Date()) : null,
            createdBy: req.user?._id,
        });


        res.status(201).json(video);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}


export async function updateVideo(req, res) {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedBy: req.user?._id };


        if (updates.title) {
            const slug = slugify(updates.title, { lower: true, strict: true });
            const exists = await Video.findOne({ slug, _id: { $ne: id } });
            updates.slug = exists ? `${slug}-${Date.now()}` : slug;
        }


        if (updates.sourceUrl) Object.assign(updates, parseVideoSource(updates.sourceUrl));


        if (updates.status === 'published' && !updates.publishedAt) updates.publishedAt = new Date();


        const video = await Video.findByIdAndUpdate(id, updates, { new: true });
        if (!video) return res.status(404).json({ message: 'Not found' });
        res.json(video);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}


export async function removeVideo(req, res) {
    const { id } = req.params;
}