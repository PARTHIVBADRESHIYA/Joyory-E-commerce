import mongoose from 'mongoose';


const VideoSchema = new mongoose.Schema(
{
title: { type: String, required: true, trim: true },
slug: { type: String, required: true, unique: true, index: true },


// source info
provider: { type: String, enum: ['youtube', 'vimeo', 'mp4'], required: true },
providerId: { type: String }, // for youtube/vimeo (e.g., "dQw4w9WgXcQ")
videoUrl: { type: String }, // for mp4 or full provider url


description: { type: String },
category: { type: String, index: true }, // or ObjectId to a Category collection
tags: [{ type: String, index: true }],


durationSec: { type: Number },
thumbnail: {
url: String,
publicId: String, // for Cloudinary/S3
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


export default mongoose.model('Video', VideoSchema);