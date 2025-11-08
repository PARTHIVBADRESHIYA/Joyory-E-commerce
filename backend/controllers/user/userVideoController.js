import crypto from 'node:crypto';
import Video from '../../models/Videos/Video.js';
import VideoView from '../../models/Videos/VideoView.js';
import { buildEmbedUrl } from '../../middlewares/utils/parseVideo.js';


export async function listPublic(req, res) {
    const { category, tag, popular, page = 1, limit = 12 } = req.query;
    const filter = { status: 'published' };
    if (category) filter.category = category;
    if (tag) filter.tags = tag;
    if (popular === '1') filter.isPopular = true;


    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
        Video.find(filter).sort({ order: 1, publishedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        Video.countDocuments(filter),
    ]);


    items.forEach(v => { v.embedUrl = buildEmbedUrl(v); });
    res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}


export async function getBySlug(req, res) {
    const { slug } = req.params;
    const v = await Video.findOne({ slug, status: 'published' }).lean();
    if (!v) return res.status(404).json({ message: 'Not found' });
    v.embedUrl = buildEmbedUrl(v);
    res.json(v);
}


export async function recordView(req, res) {
    const { id } = req.params;
    const video = await Video.findById(id);
    if (!video) return res.status(404).json({ message: 'Not found' });


    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');


    const existing = await VideoView.findOne({ video: id, $or: [{ user: req.user?._id }, { ipHash }] });
    if (!existing) {
        await VideoView.create({ video: id, user: req.user?._id, ipHash });
        await Video.findByIdAndUpdate(id, { $inc: { views: 1 } });
    }


    res.json({ ok: true });
}