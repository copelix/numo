import { DEFAULT_CATEGORIES, INCOME_SOURCES } from "../config.js";
import { Schema } from "./schema.js";
import { serialToDate } from "../lib/xlsx.js";
import { Dates } from "../lib/dates.js";
import { toNumber, uid } from "../lib/utils.js";

/* =========================================================================
   IMPORTAR UNA PLANILLA PROPIA (Excel o CSV con cualquier formato)
   Lógica pura, sin interfaz: encontrar los encabezados, adivinar qué columna
   es cada cosa y convertir las filas en gastos e ingresos de Numo.
   ========================================================================= */

/** Los campos de Numo y los nombres de columna con los que suelen aparecer en una planilla. */
export const FIELDS = {
  date: ["fecha", "dia", "date", "fecha de pago", "fecha de compra", "vencimiento"],
  description: [
    "descripcion",
    "concepto",
    "detalle",
    "nombre",
    "item",
    "comercio",
    "motivo",
    "que",
    "movimiento",
    "gasto",
  ],
  amount: [
    "monto",
    "importe",
    "valor",
    "total",
    "precio",
    "gastos",
    "egresos",
    "egreso",
    "salida",
    "salidas",
    "debe",
    "$",
    "pesos",
    "cuanto",
  ],
  income: ["ingreso", "ingresos", "entrada", "entradas", "haber", "cobro", "cobros", "credito"],
  type: ["tipo", "tipo de movimiento", "ingreso/gasto", "ingreso o gasto", "clase"],
  category: ["categoria", "rubro", "tipo de gasto", "grupo", "area"],
  paymentMethod: [
    "metodo de pago",
    "medio de pago",
    "forma de pago",
    "metodo",
    "medio",
    "pago",
    "pagado con",
    "cuenta",
    "tarjeta",
  ],
  currency: ["moneda", "divisa"],
};

/** Minúsculas, sin acentos ni espacios de más: "Categoría " → "categoria". */
export const normalize = text =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Texto de encabezado: no vacío, ni fecha, ni número ("$" o "Monto $" sí cuentan como texto). */
const isText = v =>
  typeof v === "string" && v.trim() !== "" && !looksLikeDate(v) && !(/\d/.test(v) && /^[-$\s\d.,]+$/.test(v));
const looksLikeDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Busca la fila de encabezados: la primera, entre las primeras 30, con dos o más celdas de texto
 * y ningún número (así se saltean títulos como "Gastos 2024" y filas vacías).
 * Si no hay, la planilla no tiene encabezados: se nombran "Columna A", "Columna B"…
 */
export function readTable(rows) {
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).filter(v => v !== "" && v !== undefined);
    if (cells.length >= 2 && cells.every(isText)) {
      const headers = (rows[i] ?? []).map((h, c) => String(h ?? "").trim() || `Columna ${letter(c)}`);
      return { headers: dedupe(headers), data: rows.slice(i + 1) };
    }
  }
  const width = Math.max(0, ...rows.map(r => r?.length ?? 0));
  return { headers: Array.from({ length: width }, (_, c) => `Columna ${letter(c)}`), data: rows };
}
const letter = n => (n >= 26 ? letter(Math.floor(n / 26) - 1) : "") + String.fromCharCode(65 + (n % 26));
function dedupe(headers) {
  const seen = new Map();
  return headers.map(h => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n > 1 ? `${h} (${n})` : h;
  });
}

/** Adivina qué columna es cada campo por el nombre del encabezado. Devuelve { campo: nombre de columna }. */
export function guessMapping(headers) {
  const mapping = {};
  const taken = new Set();
  const pick = (field, exact) => {
    for (const h of headers) {
      if (taken.has(h)) continue;
      const n = normalize(h);
      const hit = FIELDS[field].some(word => (exact ? n === word : n === word || n.startsWith(`${word} `)));
      if (hit) {
        mapping[field] = h;
        taken.add(h);
        return;
      }
    }
  };
  // Primero las coincidencias exactas de todos los campos, después las aproximadas ("Monto en pesos")
  for (const exact of [true, false])
    for (const field of ["date", "amount", "income", "type", "category", "paymentMethod", "currency", "description"])
      if (!mapping[field]) pick(field, exact);
  return mapping;
}

/** Una fecha de la planilla → "AAAA-MM-DD", o "" si no se entiende. Acepta 31/12/2024, 31-12-24, 2024-12-31 y números de Excel. */
export function parseDate(value) {
  if (typeof value === "number") return value > 20000 && value < 80000 ? serialToDate(value) : "";
  const text = String(value ?? "").trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(year, +m[2], +m[1]); // en Argentina el día va primero
  }
  return "";
}
function valid(y, m, d) {
  const text = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Dates.isValid(text) ? text : "";
}

/** Un monto de la planilla → número con signo. "$ 1.234,50" → 1234.5; "(500)" → -500. */
export function parseAmount(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!/\d/.test(text)) return 0;
  const negative = /^\(.*\)$/.test(text) || /^-|-\s*$/.test(text.replace(/[^\d.,-]/g, ""));
  const n = Math.abs(toNumber(text.replace(/[()]/g, "")));
  return negative ? -n : n;
}

/** "US$", "u$s", "dólares" → USD; "$", "pesos" → ARS. */
export function parseCurrency(value, fallback) {
  const n = normalize(value);
  if (!n) return fallback;
  if (/^(usd|us\$|u\$s|u\$d|dolar|dolares|dol)$/.test(n)) return "USD";
  if (/^(ars|\$|pesos|peso|\$ar)$/.test(n)) return "ARS";
  if (/^(eur|euro|euros|€)$/.test(n)) return "EUR";
  const code = n.toUpperCase();
  return ["BRL", "UYU", "CLP", "MXN", "GBP"].includes(code) ? code : fallback;
}

const INCOME_WORDS = /ingreso|entrada|cobro|cobre|haber|sueldo|salario|credito|venta|deposito|aguinaldo/;
const SUMMARY_ROW = /^(sub ?)?total|^saldo|^resumen|^balance|^suma/;

/**
 * Convierte las filas de las hojas elegidas en movimientos.
 * sheets: [{ name, headers, data }]; mapping: { campo: nombre de columna }.
 * Cómo se decide si una fila es gasto o ingreso:
 *  - columna "Tipo": si dice ingreso, cobro, sueldo… es ingreso; si no, gasto;
 *  - columna aparte de ingresos: si tiene un monto ahí, es ingreso;
 *  - sin ninguna de las dos: si hay montos negativos y positivos, los negativos son gastos
 *    y los positivos ingresos; si son todos positivos, todo es gasto.
 */
export function buildMovements(sheets, mapping, { baseCurrency = "ARS", existing = [], from = "" } = {}) {
  const out = { expenses: [], incomes: [], skipped: 0, duplicates: 0, rule: "", first: "", last: "" };
  const known = new Set(existing.map(movementKey));
  const raw = [];

  for (const sheet of sheets) {
    // Cada campo usa la columna elegida; si esta hoja no la tiene (otra hoja con otros nombres),
    // usa la que se adivina para esta hoja. Si se eligió "—", queda sin columna.
    const own = guessMapping(sheet.headers);
    const col = field => {
      if (mapping[field] === "") return -1;
      const i = mapping[field] ? sheet.headers.indexOf(mapping[field]) : -1;
      return i >= 0 ? i : own[field] ? sheet.headers.indexOf(own[field]) : -1;
    };
    const c = Object.fromEntries(Object.keys(FIELDS).map(f => [f, col(f)]));
    if (c.date < 0 || (c.amount < 0 && c.income < 0)) continue;
    const mode = c.type >= 0 ? "type" : c.income >= 0 ? "split" : "sign";
    for (const row of sheet.data) {
      const cell = i => (i >= 0 ? (row[i] ?? "") : "");
      if (!row.some(v => v !== "" && v !== undefined)) continue;
      const description = String(cell(c.description)).trim();
      if (SUMMARY_ROW.test(normalize(description))) continue;
      const date = parseDate(cell(c.date));
      const amount = parseAmount(cell(c.amount));
      const incomeAmount = parseAmount(cell(c.income));
      if (!date || (!amount && !incomeAmount)) {
        out.skipped++;
        continue;
      }
      if (from && date < from) continue;
      raw.push({
        mode,
        date,
        amount,
        incomeAmount,
        description,
        type: normalize(cell(c.type)),
        category: String(cell(c.category)).trim(),
        paymentMethod: String(cell(c.paymentMethod)).trim(),
        currency: parseCurrency(cell(c.currency), /US\$|U\$S|USD/i.test(String(cell(c.amount))) ? "USD" : baseCurrency),
      });
    }
  }

  const bySign = raw.filter(r => r.mode === "sign");
  const signed = bySign.some(r => r.amount < 0) && bySign.some(r => r.amount > 0);
  const modes = new Set(raw.map(r => r.mode));
  out.rule = [
    modes.has("type") && "Gasto o ingreso según lo que dice la columna «Tipo».",
    modes.has("split") && "Lo que está en la columna de ingresos entra como ingreso; el resto, como gasto.",
    modes.has("sign") &&
      (signed
        ? "Los montos negativos entran como gastos y los positivos, como ingresos."
        : modes.size > 1
          ? "En las hojas sin columna de ingresos, todo entra como gasto."
          : "Todo entra como gasto."),
  ]
    .filter(Boolean)
    .join(" ");

  for (const r of raw) {
    const isIncome =
      r.mode === "type"
        ? INCOME_WORDS.test(r.type)
        : r.mode === "split"
          ? r.incomeAmount !== 0 && !r.amount
          : signed && r.amount > 0;
    const amount = Math.abs(isIncome && r.mode === "split" ? r.incomeAmount : r.amount);
    if (!amount) {
      out.skipped++;
      continue;
    }
    const description = (r.description || r.category || (isIncome ? "Ingreso" : "Gasto")).slice(0, 80);
    const movement = { description, amount, currency: r.currency, date: r.date };
    if (known.has(movementKey(movement))) {
      out.duplicates++;
      continue;
    }
    if (isIncome) out.incomes.push({ ...movement, source: r.category || r.type });
    else out.expenses.push({ ...movement, category: r.category, paymentMethod: r.paymentMethod });
    if (!out.first || r.date < out.first) out.first = r.date;
    if (!out.last || r.date > out.last) out.last = r.date;
  }
  return out;
}

/** Fecha, monto y descripción: si ya hay un movimiento igual cargado, no se vuelve a importar. */
export const movementKey = m =>
  `${m.date}|${Math.round(Number(m.amount) * 100)}|${normalize(m.description)}|${m.currency ?? ""}`;

/** Busca la categoría por nombre (sin importar acentos ni mayúsculas) y, si no existe, la crea. */
export function categoryFor(state, name, fallback) {
  if (!String(name ?? "").trim()) return fallback;
  let cat = state.categories.find(c => normalize(c.name) === normalize(name));
  if (!cat) {
    cat = {
      id: uid(),
      name: String(name).trim().slice(0, 40),
      icon: "🏷️",
      color: DEFAULT_CATEGORIES[state.categories.length % DEFAULT_CATEGORIES.length].color,
    };
    state.categories.push(cat);
  }
  return cat.id;
}

/** Agrega al estado lo que devolvió buildMovements. */
export function applyMovements(state, result, fallbackCategory) {
  for (const e of result.expenses) {
    const categoryId = categoryFor(state, e.category, fallbackCategory);
    const ctx = { ids: new Set(state.categories.map(c => c.id)), fallback: fallbackCategory };
    const expense = Schema.expense({ ...e, categoryId, recurring: false }, ctx);
    if (expense) state.expenses.push(expense);
  }
  for (const i of result.incomes) {
    const source = INCOME_SOURCES.find(x => normalize(x.name) === normalize(i.source) || x.id === normalize(i.source));
    const income = Schema.income({
      ...i,
      sourceId: source?.id ?? (/sueldo|salario/.test(normalize(i.source)) ? "sueldo" : "otros"),
    });
    if (income) state.incomes.push(income);
  }
}
