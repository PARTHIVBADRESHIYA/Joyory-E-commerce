import url from 'node:url';


export function parseVideoSource(sourceUrl) {
    const u = new URL(sourceUrl);
    const host = u.hostname.replace('www.', '');


    // YouTube long or short
    if (host.includes('youtube.com')) {
        const id = u.searchParams.get('v');
        if (!id) throw new Error('YouTube URL missing v param');
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


    // Fallback: treat as direct MP4/stream
    if (/\.mp4($|\?)/i.test(sourceUrl)) {
        return { provider: 'mp4', providerId: null, videoUrl: sourceUrl };
    }


    throw new Error('Unsupported video URL');
}


export function buildEmbedUrl({ provider, providerId, videoUrl }) {
    if (provider === 'youtube') return `https://www.youtube.com/embed/${providerId}`;
    if (provider === 'vimeo') return `https://player.vimeo.com/video/${providerId}`;
    // mp4 -> return raw url; frontend uses <video src>
    return videoUrl;
}