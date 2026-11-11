/* =========================================================================
   0. CONFIGURACIÓN
   ========================================================================= */
export const CONFIG = Object.freeze({
  version: __APP_VERSION__,
  schemaVersion: 2,
  cacheKey: "cuentas-claras:cache", // nombre interno anterior a "Numo": no cambiar, o se pierden los datos guardados
  legacyStorageKeys: ["cuentas-claras:data", "cuentas-claras-v1"],
  soonDays: 7,
});
export const CURRENCIES = ["ARS", "USD", "EUR", "BRL", "UYU", "CLP", "MXN", "GBP"];
/* Valores de referencia editables en Ajustes: unidades de cada moneda por 1 USD. */
export const DEFAULT_RATES = { USD: 1, ARS: 1450, EUR: 0.86, BRL: 5.4, UYU: 40, CLP: 950, MXN: 18.5, GBP: 0.75 };
/* Cotización del dólar automática: DolarAPI es una fuente pública y gratuita de las cotizaciones argentinas. */
export const DOLAR_API = "https://dolarapi.com/v1/dolares";
export const DOLAR_SOURCES = [
  ["oficial", "Automática: dólar oficial"],
  ["bolsa", "Automática: dólar MEP"],
  ["blue", "Automática: dólar blue"],
  ["manual", "La cargo yo"],
];
/* Percepción de Ganancias al pagar en pesos con tarjeta en moneda extranjera (RG 5617/2024). Editable. */
export const DEFAULT_CARD_TAX = 30;
/* Inflación mensual en % (IPC nacional del INDEC). Se completa o corrige en Más → Inflación. */
export const DEFAULT_IPC = {
  "2024-01": 20.6,
  "2024-02": 13.2,
  "2024-03": 11.0,
  "2024-04": 8.8,
  "2024-05": 4.2,
  "2024-06": 4.6,
  "2024-07": 4.0,
  "2024-08": 4.2,
  "2024-09": 3.5,
  "2024-10": 2.7,
  "2024-11": 2.4,
  "2024-12": 2.7,
  "2025-01": 2.2,
  "2025-02": 2.4,
  "2025-03": 3.7,
  "2025-04": 2.8,
  "2025-05": 1.5,
  "2025-06": 1.6,
  "2025-07": 1.9,
  "2025-08": 1.9,
  "2025-09": 2.1,
  "2025-10": 2.3,
  "2025-11": 2.5,
  "2025-12": 2.8,
  "2026-01": 2.9,
  "2026-02": 2.9,
  "2026-03": 3.4,
  "2026-04": 2.6,
  "2026-05": 2.1,
  "2026-06": 1.9,
  "2026-07": 2.1,
  "2026-08": 1.7,
  "2026-09": 1.9,
};
export const INDEC_IPC_URL = "https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31";
export const FREQUENCIES = {
  semanal: { label: "Semanal", perMonth: 52 / 12, days: 7 },
  mensual: { label: "Mensual", perMonth: 1, months: 1 },
  trimestral: { label: "Trimestral", perMonth: 1 / 3, months: 3 },
  anual: { label: "Anual", perMonth: 1 / 12, months: 12 },
};
export const STATUSES = { activa: "Activa", pausada: "Pausada", cancelada: "Cancelada" };
export const USAGE = { "": "Sin dato", alto: "Mucho", medio: "A veces", bajo: "Poco" };
export const INCOME_SOURCES = [
  { id: "sueldo", name: "Sueldo", icon: "💼" },
  { id: "freelance", name: "Trabajos y changas", icon: "🧰" },
  { id: "ventas", name: "Ventas", icon: "🏷️" },
  { id: "inversiones", name: "Inversiones", icon: "📈" },
  { id: "regalos", name: "Regalos", icon: "🎁" },
  { id: "otros", name: "Otros", icon: "➕" },
];
export const PAYMENT_METHODS = [
  "Efectivo",
  "Tarjeta de débito",
  "Tarjeta de crédito",
  "Billetera virtual",
  "Transferencia",
];
export const DEFAULT_CATEGORIES = [
  { id: "entretenimiento", name: "Entretenimiento", icon: "🎬", color: "#ff6363" },
  { id: "salud", name: "Salud y deporte", icon: "💪", color: "#59d499" },
  { id: "tecnologia", name: "Tecnología", icon: "💻", color: "#63a1ff" },
  { id: "comida", name: "Comida", icon: "🛒", color: "#f2c46d" },
  { id: "transporte", name: "Transporte", icon: "🚌", color: "#56c2ff" },
  { id: "hogar", name: "Hogar", icon: "🏠", color: "#c4a7e7" },
  { id: "otros", name: "Otros", icon: "📦", color: "#9c9c9d" },
];
export const UNKNOWN_CATEGORY = Object.freeze({ id: "", name: "Sin categoría", icon: "❔", color: "#9c9c9d" });
export const ROUTES = [
  { id: "inicio", label: "Inicio", title: "Inicio", icon: "home", main: true },
  { id: "movimientos", label: "Movimientos", title: "Movimientos", icon: "receipt", main: true },
  { id: "suscripciones", label: "Suscrip.", title: "Suscripciones", icon: "repeat", main: true, wide: "Suscripciones" },
  { id: "informes", label: "Informes", title: "Informes", icon: "chart", main: true },
  { id: "mas", label: "Más", title: "Más", icon: "menu", main: true },
  // Páginas dentro de "Más"
  { id: "cuenta", title: "Tu cuenta", icon: "cloud", parent: "mas" },
  { id: "pagos", title: "Próximos pagos", icon: "calendar", parent: "mas" },
  { id: "planear", title: "Metas y topes", icon: "target", parent: "mas" },
  { id: "cuotas", title: "Cuotas", icon: "card", parent: "mas" },
  { id: "compartidos", title: "Gastos compartidos", icon: "users", parent: "mas" },
  { id: "compartido", title: "Gasto compartido", icon: "users", parent: "mas" },
  { id: "inflacion", title: "Inflación", icon: "trend", parent: "mas" },
  { id: "ajustes", title: "Ajustes generales", icon: "settings", parent: "mas" },
  { id: "categorias", title: "Categorías", icon: "tag", parent: "mas" },
  { id: "cambio", title: "Tipos de cambio", icon: "swap", parent: "mas" },
  { id: "datos", title: "Tus datos", icon: "save", parent: "mas" },
];
