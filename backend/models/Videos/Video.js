
import mongoose from 'mongoose';

const VideoSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true, index: true },

        provider: { type: String, enum: ['youtube', 'vimeo', 'mp4'], required: true },
        providerId: { type: String },

        videoUrl: {
            type: String,
            validate: {
                validator: function (v) {
                    if (!v) return true;
                    return /^https?:\/\/.+/.test(v);    
                },
                message: 'Invalid URL',
            },
        },

        cloudPublicId: { type: String }, // for mp4 uploads

        description: { type: String },
        category: { type: String, index: true },
        tags: [{ type: String, index: true }],

        durationSec: { type: Number },
        thumbnail: {
            url: String,
            publicId: String,
        },

        status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
        publishedAt: { type: Date },
        isPopular: { type: Boolean, default: false, index: true },
        order: { type: Number, default: 0 },
        views: { type: Number, default: 0 },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// --- YouTube ID extraction ---
function extractYouTubeId(url) {
    if (!url) return null;
    const regexList = [
        /(?:youtube\.com\/.*v=|youtu\.be\/)([^&#?/]+)/,
        /youtube\.com\/shorts\/([^&#?/]+)/
    ];
    for (const regex of regexList) {
        const match = url.match(regex);
        if (match && match[1]) return match[1];
    }
    return null;
}

VideoSchema.pre('validate', function (next) {
    if (this.provider === 'mp4' && !this.videoUrl) {
        return next(new Error('MP4 videos require a videoUrl'));
    }

    if (this.provider === 'youtube') {
        const videoId = extractYouTubeId(this.videoUrl);
        if (!videoId) {
            return next(new Error('YouTube URL missing valid video ID'));
        }
        this.providerId = videoId;
    }

    if (this.provider === 'vimeo') {
        if (!/^https?:\/\/(www\.)?vimeo\.com\/\d+/.test(this.videoUrl)) {
            return next(new Error('Invalid Vimeo URL'));
        }
    }

    next();
});

export default mongoose.model('Video', VideoSchema);
