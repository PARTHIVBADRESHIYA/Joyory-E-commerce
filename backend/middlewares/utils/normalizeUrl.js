export const normalizeUrl = (u) => {
try {
return new URL(u).origin + new URL(u).pathname.replace(/\/+$/,'');
} catch(e) {
return u.trim().toLowerCase().replace(/\/+$/,'');
}
}