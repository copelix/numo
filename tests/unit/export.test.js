import { beforeEach, describe, expect, it } from "vitest";
import { collect, fileName, PERIODS, span, workbookSheets } from "../../src/core/export.js";
import { Schema } from "../../src/core/schema.js";
import { buildMovements, guessMapping, readTable } from "../../src/core/sheet-import.js";
import { Store } from "../../src/core/store.js";
import { dateToSerial, writeXlsx } from "../../src/lib/xlsx-write.js";
import { readXlsx, serialToDate } from "../../src/lib/xlsx.js";

beforeEach(() => {
  Store.state = Schema.normalize({
    version: 2,
    settings: { rates: { ARS: 1000 }, cardTax: 30 },
    expenses: [
      { id: "e1", description: "Super", amount: 50000, currency: "ARS", date: "2025-12-20", categoryId: "comida" },
      {
        id: "e2",
        description: "Spotify",
        amount: 5,
        currency: "USD",
        date: "2026-01-05",
        categoryId: "entretenimiento",
        cardTax: true,
      },
      {
        id: "e3",
        description: "Nafta & aceite",
        amount: 30000,
        currency: "ARS",
        date: "2026-02-10",
        categoryId: "transporte",
        paymentMethod: "Efectivo",
      },
    ],
    incomes: [
      { id: "i1", description: "Sueldo", amount: 900000, currency: "ARS", date: "2026-01-01", sourceId: "sueldo" },
    ],
    subscriptions: [
      { id: "s1", name: "Netflix", amount: 9999, currency: "ARS", frequency: "mensual", nextDate: "2026-03-01" },
    ],
  });
});

describe("generador de Excel", () => {
  it("arma un archivo que se vuelve a leer igual", async () => {
    const bytes = writeXlsx([
      {
        name: "Gastos",
        columns: [{ header: "Fecha", type: "date" }, { header: "Descripción" }, { header: "Monto", type: "money" }],
        rows: [
          ["2024-02-29", 'Café & <medialunas> "ricas"', 1234.567],
          ["2024-03-01", "", 10],
        ],
      },
      { name: "Gastos", columns: [{ header: "N", type: "number" }], rows: [] },
    ]);
    const [a, b] = await readXlsx(bytes);
    expect(a.name).toBe("Gastos");
    expect(b.name).toBe("Gastos (2)");
    expect(a.rows).toEqual([
      ["Fecha", "Descripción", "Monto"],
      ["2024-02-29", 'Café & <medialunas> "ricas"', 1234.57],
      ["2024-03-01", "", 10],
    ]);
  });

  it("convierte fechas a número de serie de Excel y vuelta", () => {
    for (const d of ["1900-03-01", "2024-02-29", "2026-11-20"]) expect(serialToDate(dateToSerial(d))).toBe(d);
  });
});

describe("qué se exporta", () => {
  it("los períodos van de una fecha a otra", () => {
    expect(PERIODS.month.range("2026-11-20")).toEqual(["2026-11-01", "2026-11-20"]);
    expect(PERIODS.year.range("2026-11-20")).toEqual(["2026-01-01", "2026-11-20"]);
    expect(PERIODS.last12.range("2026-11-20")).toEqual(["2025-11-21", "2026-11-20"]);
    expect(PERIODS.all.range("2026-11-20")).toEqual(["", ""]);
  });

  it("filtra gastos e ingresos por fecha, y respeta lo que se incluye", () => {
    const data = collect({ from: "2026-01-01", to: "2026-12-31", include: ["expenses", "subscriptions"] });
    expect(data.expenses.map(e => e.id)).toEqual(["e2", "e3"]);
    expect(data.incomes).toEqual([]);
    expect(data.subscriptions).toHaveLength(1);
    expect(span(data)).toEqual(["2026-01-05", "2026-02-10"]);
    expect(fileName(data, "xlsx")).toBe("numo-2026-01-01-a-2026-12-31.xlsx");
  });

  it("arma el resumen por mes en la moneda principal, con impuestos de tarjeta", () => {
    const sheets = workbookSheets(collect());
    expect(sheets.map(s => s.name)).toEqual(["Resumen", "Gastos", "Ingresos", "Suscripciones"]);
    const resumen = sheets[0];
    expect(resumen.columns.map(c => c.header)).toEqual(["Mes", "Ingresos (ARS)", "Gastos (ARS)", "Balance (ARS)"]);
    expect(resumen.rows).toEqual([
      ["2025-12", 0, 50000, -50000],
      ["2026-01", 900000, 6500, 893500], // 5 USD × 1000 + 30%
      ["2026-02", 0, 30000, -30000],
      ["Total", 900000, 86500, 813500],
    ]);
    const gastos = sheets[1];
    expect(gastos.rows[2]).toEqual(["2026-02-10", "Nafta & aceite", "Transporte", 30000, "ARS", 30000, "Efectivo", ""]);
  });

  it("el Excel que exporta Numo se vuelve a importar sin perder ni repetir nada", async () => {
    const files = await readXlsx(writeXlsx(workbookSheets(collect())));
    const sheets = files
      .filter(f => ["Gastos", "Ingresos"].includes(f.name))
      .map(f => ({ name: f.name, ...readTable(f.rows) }));
    const mapping = guessMapping([...new Set(sheets.flatMap(s => s.headers))]);

    const fresh = buildMovements(sheets, mapping);
    expect(fresh.expenses.map(e => [e.date, e.description, e.amount, e.currency])).toEqual([
      ["2025-12-20", "Super", 50000, "ARS"],
      ["2026-01-05", "Spotify", 5, "USD"],
      ["2026-02-10", "Nafta & aceite", 30000, "ARS"],
    ]);
    expect(fresh.incomes.map(i => [i.description, i.source])).toEqual([["Sueldo", "Sueldo"]]);

    const again = buildMovements(sheets, mapping, { existing: [...Store.state.expenses, ...Store.state.incomes] });
    expect(again.expenses.length + again.incomes.length).toBe(0);
    expect(again.duplicates).toBe(4);
  });
});
