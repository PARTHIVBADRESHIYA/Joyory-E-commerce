export function parseVideoSource(sourceUrl) {
    const u = new URL(sourceUrl);
    const host = u.hostname.replace('www.', '');

    // YouTube watch, shorts, youtu.be
    if (host.includes('youtube.com')) {
        let id = u.searchParams.get('v');

        // Handle Shorts
        if (!id && u.pathname.startsWith('/shorts/')) {
            id = u.pathname.split('/')[2]; // e.g. /shorts/Pt4UjdiWrmc
        }

        if (!id) throw new Error('YouTube URL missing valid video ID');
        return { provider: 'youtube', providerId: id, videoUrl: sourceUrl };
    }

    if (host === 'youtu.be') {
        const id = u.pathname.replace('/', '');
        return { provider: 'youtube', providerId: id, videoUrl: sourceUrl };
    }

    // Vimeo
    if (host.includes('vimeo.com')) {
        const id = u.pathname.split('/').filter(Boolean).pop();
        return { provider: 'vimeo', providerId: id, videoUrl: sourceUrl };
    }

    // MP4
    if (/\.mp4($|\?)/i.test(sourceUrl)) {
        return { provider: 'mp4', providerId: null, videoUrl: sourceUrl };
    }

    throw new Error('Unsupported video URL');
}


export function buildEmbedUrl({ provider, providerId, videoUrl }) {
    if (provider === 'youtube') return `https://www.youtube.com/embed/${providerId}`;
    if (provider === 'vimeo') return `https://player.vimeo.com/video/${providerId}`;
    return videoUrl; // mp4 direct
}
