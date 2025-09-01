// import mongoose from 'mongoose';


// const VideoViewSchema = new mongoose.Schema(
//     {
//         video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', index: true, required: true },
//         user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//         ipHash: { type: String, index: true },
//         createdAt: { type: Date, default: Date.now },
//         // TTL index: auto delete after 24h -> ensures uniqueness window
//         expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: { expires: 0 } },
//     },
//     { timestamps: false }
// );


// export default mongoose.model('VideoView', VideoViewSchema);    







import mongoose from 'mongoose';

const VideoViewSchema = new mongoose.Schema(
    {
        video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', index: true, required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        ipHash: { type: String, index: true },
        // auto-remove after 24h
        createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
    },
    { timestamps: false } // we don't need `updatedAt` for views
);

// compound uniqueness constraints (within 24h window)
VideoViewSchema.index({ video: 1, user: 1 });
VideoViewSchema.index({ video: 1, ipHash: 1 });

export default mongoose.model('VideoView', VideoViewSchema);
