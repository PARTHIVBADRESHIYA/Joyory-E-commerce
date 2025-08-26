// utils/slug.js
export const toSlug = (str = "") =>
    String(str)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")     // strip accents
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "");

export const slugToRegex = (slug = "") => {
    // "mamaearth" => /^mamaearth$/i | "l-oreal-paris" => /^l[ -]?oreal[ -]?paris$/i
    const name = decodeURIComponent(slug).replace(/-/g, "[ -]?");
    return new RegExp(`^${name}$`, "i");
};

export const clamp = (num, min, max) => Math.max(min, Math.min(max, num));
