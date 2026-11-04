/* ---- Plantillas HTML seguras: todo lo interpolado se escapa salvo que sea html`` ---- */
export class SafeHTML { constructor(value) { this.value = value; } toString() { return this.value; } }
export const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ESCAPES[char]);
export const trusted = value => new SafeHTML(String(value));
export function toHTML(value) {
  if (value === null || value === undefined || value === false || value === true) return "";
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(toHTML).join("");
  return escapeHTML(value);
}
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += toHTML(value) + strings[i + 1]; });
  return new SafeHTML(out);
}
/** Atributos opcionales: {required: true, maxlength: 80, disabled: false} → ' required maxlength="80"' */
export function attrs(map = {}) {
  return trusted(Object.entries(map)
    .filter(([, value]) => value !== false && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${escapeHTML(value)}"`))
    .join(""));
}
