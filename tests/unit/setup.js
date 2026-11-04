/* jsdom no trae matchMedia: lo simulamos (tema oscuro, sin movimiento reducido). */
window.matchMedia ??= query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.matchMedia ??= window.matchMedia;
