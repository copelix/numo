import { FREQUENCIES, STATUSES } from "../config.js";
import { Finance } from "./finance.js";
import { Money } from "./money.js";
import { Store } from "./store.js";
import { Dates } from "../lib/dates.js";

/* =========================================================================
   EXPORTAR
   Qué datos entran según el período y qué incluir, y cómo se arman las hojas
   del Excel. Sin interfaz: el formulario está en forms/export.js.
   ========================================================================= */

/** Los períodos que se ofrecen. Devuelven [desde, hasta] como "AAAA-MM-DD" ("" = sin límite). */
export const PERIODS = {
  month: { label: "Este mes", range: today => [`${today.slice(0, 7)}-01`, today] },
  year: { label: "Este año", range: today => [`${today.slice(0, 4)}-01-01`, today] },
  last12: {
    label: "Últimos 12 meses",
    range: today => [Dates.addDays(Dates.addMonths(today, -12, Dates.dayOf(today)), 1), today],
  },
  all: { label: "Todo", range: () => ["", ""] },
  custom: { label: "Elegir fechas", range: () => ["", ""] },
};

/** Lo que se puede incluir, en el orden de las hojas. */
export const PARTS = {
  expenses: "Gastos",
  incomes: "Ingresos",
  subscriptions: "Suscripciones",
  installments: "Cuotas",
};

/**
 * Junta los datos a exportar. Los gastos e ingresos se filtran por fecha;
 * las suscripciones y las cuotas se exportan como están hoy.
 */
export function collect({ from = "", to = "", include = Object.keys(PARTS) } = {}, state = Store.state) {
  const inRange = x => (!from || x.date >= from) && (!to || x.date <= to);
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const want = new Set(include);
  return {
    from,
    to,
    expenses: want.has("expenses") ? state.expenses.filter(inRange).sort(byDate) : [],
    incomes: want.has("incomes") ? state.incomes.filter(inRange).sort(byDate) : [],
    subscriptions: want.has("subscriptions") ? [...state.subscriptions] : [],
    installments: want.has("installments") ? [...state.installments] : [],
  };
}

/** El primer y el último día con movimientos, para decir de cuándo a cuándo es el archivo. */
export function span(data) {
  const dates = [...data.expenses, ...data.incomes].map(x => x.date).sort();
  return dates.length ? [dates[0], dates.at(-1)] : ["", ""];
}

/** Las hojas del Excel: un resumen por mes y una hoja por cada cosa incluida. */
export function workbookSheets(data) {
  const base = Money.base;
  const sheets = [];
  const has = data.expenses.length || data.incomes.length;

  if (has) {
    const months = new Map();
    const add = (date, key, value) => {
      const m = date.slice(0, 7);
      const row = months.get(m) ?? { incomes: 0, expenses: 0 };
      row[key] += value;
      months.set(m, row);
    };
    for (const e of data.expenses) add(e.date, "expenses", Money.cost(e));
    for (const i of data.incomes) add(i.date, "incomes", Money.cost(i));
    const rows = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, r]) => [m, r.incomes, r.expenses, r.incomes - r.expenses]);
    if (rows.length > 1) {
      const t = rows.reduce((acc, r) => [acc[0] + r[1], acc[1] + r[2]], [0, 0]);
      rows.push(["Total", t[0], t[1], t[0] - t[1]]);
    }
    sheets.push({
      name: "Resumen",
      columns: [
        { header: "Mes", width: 10 },
        { header: `Ingresos (${base})`, type: "money", width: 16 },
        { header: `Gastos (${base})`, type: "money", width: 16 },
        { header: `Balance (${base})`, type: "money", width: 16 },
      ],
      rows,
    });
  }

  if (data.expenses.length)
    sheets.push({
      name: "Gastos",
      columns: [
        { header: "Fecha", type: "date", width: 11 },
        { header: "Descripción", width: 32 },
        { header: "Categoría", width: 16 },
        { header: "Monto", type: "money", width: 14 },
        { header: "Moneda", width: 8 },
        { header: `En ${base}`, type: "money", width: 14 },
        { header: "Método de pago", width: 18 },
        { header: "Origen", width: 16 },
      ],
      rows: data.expenses.map(e => [
        e.date,
        e.description,
        Finance.category(e.categoryId).name,
        e.amount,
        e.currency,
        Money.cost(e),
        e.paymentMethod,
        e.installmentId
          ? `Cuota ${e.installmentN}/${e.installmentCount}`
          : e.subscriptionId
            ? "Suscripción"
            : e.templateId || e.recurring
              ? "Fijo mensual"
              : "",
      ]),
    });
  if (data.incomes.length)
    sheets.push({
      name: "Ingresos",
      columns: [
        { header: "Fecha", type: "date", width: 11 },
        { header: "Descripción", width: 32 },
        { header: "Categoría", width: 18 },
        { header: "Monto", type: "money", width: 14 },
        { header: "Moneda", width: 8 },
        { header: `En ${base}`, type: "money", width: 14 },
        { header: "Fijo mensual", width: 12 },
      ],
      rows: data.incomes.map(i => [
        i.date,
        i.description,
        Finance.incomeSource(i.sourceId).name,
        i.amount,
        i.currency,
        Money.cost(i),
        i.recurring || i.templateId ? "Sí" : "No",
      ]),
    });
  if (data.subscriptions.length)
    sheets.push({
      name: "Suscripciones",
      columns: [
        { header: "Nombre", width: 22 },
        { header: "Monto", type: "money", width: 12 },
        { header: "Moneda", width: 8 },
        { header: "Frecuencia", width: 12 },
        { header: `Por mes en ${base}`, type: "money", width: 16 },
        { header: "Próximo pago", type: "date", width: 13 },
        { header: "Estado", width: 11 },
        { header: "Categoría", width: 16 },
        { header: "Método de pago", width: 18 },
        { header: "Notas", width: 30 },
      ],
      rows: data.subscriptions.map(s => [
        s.name,
        s.amount,
        s.currency,
        FREQUENCIES[s.frequency]?.label ?? s.frequency,
        Finance.monthlyCost(s),
        s.nextDate,
        STATUSES[s.status] ?? s.status,
        Finance.category(s.categoryId).name,
        s.paymentMethod,
        s.notes,
      ]),
    });
  if (data.installments.length)
    sheets.push({
      name: "Cuotas",
      columns: [
        { header: "Compra", width: 26 },
        { header: "Cuota", type: "money", width: 12 },
        { header: "Moneda", width: 8 },
        { header: "Cuotas", type: "number", width: 8 },
        { header: "Pagadas", type: "number", width: 9 },
        { header: "Primera cuota", type: "date", width: 13 },
        { header: "Total", type: "money", width: 14 },
        { header: "Categoría", width: 16 },
        { header: "Método de pago", width: 18 },
      ],
      rows: data.installments.map(p => [
        p.description,
        p.amount,
        p.currency,
        p.count,
        Math.min(p.done, p.count),
        p.firstDate,
        p.amount * p.count,
        Finance.category(p.categoryId).name,
        p.paymentMethod,
      ]),
    });
  return sheets;
}

/** "numo-2026-01-01-a-2026-11-20.xlsx", o "numo-2026-11-20.xlsx" si es todo. */
export function fileName(data, ext) {
  const [first, last] = [data.from, data.to];
  return first || last ? `numo-${first || "inicio"}-a-${last || Dates.today()}.${ext}` : `numo-${Dates.today()}.${ext}`;
}
