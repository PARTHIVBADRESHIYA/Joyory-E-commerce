// utils/slug.js
import slugify from "slugify";


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


export const generateUniqueSlug = async (Model, base, field = "slug") => {
    let raw = slugify(base, { lower: true, strict: true });
    if (!raw) raw = Math.random().toString(36).slice(2, 8);
    let slug = raw;
    let i = 1;
    // ensure unique on the collection
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const exists = await Model.findOne({ [field]: slug });
        if (!exists) return slug;
        slug = `${raw}-${i++}`;
    }
};