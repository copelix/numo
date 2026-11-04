/* =========================================================================
   1. UTILIDADES
   ========================================================================= */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
export const deepClone = value => JSON.parse(JSON.stringify(value));
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
export const asArray = value => (Array.isArray(value) ? value : []);
export const capitalize = text => (text ? text[0].toUpperCase() + text.slice(1) : "");
export const isHexColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
/** Convierte "4.99", "4,99" o "1.234,56" en número. Devuelve 0 si no es válido. */
export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value ?? "").trim().replace(/[^\d.,-]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");          // 1.500 o 12.345.678: puntos de miles
  } else {
    text = text.replace(",", ".");
  }
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}
/** Número para mostrar en un campo de texto, con coma decimal (4,99). */
export const numberText = value => (value === "" || value === null || value === undefined ? "" : String(value).replace(".", ","));
/** ¿El texto es un número válido escrito con coma o punto? */
export const isNumberText = text => /\d/.test(text) && /^-?[\d.,\s]+$/.test(text.trim());
export function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
