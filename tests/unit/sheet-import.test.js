import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Schema } from "../../src/core/schema.js";
import {
  applyMovements,
  buildMovements,
  guessMapping,
  parseAmount,
  parseCurrency,
  parseDate,
  readTable,
} from "../../src/core/sheet-import.js";
import { Store } from "../../src/core/store.js";
import { isDateFormat, readXlsx, serialToDate } from "../../src/lib/xlsx.js";

const fixture = name => readFileSync(resolve("tests/fixtures", name));

beforeEach(() => {
  Store.state = Schema.normalize({ version: 2 });
});

describe("lector de Excel", () => {
  for (const file of ["planilla.xlsx", "planilla-libreoffice.xlsx"]) {
    it(`lee hojas, textos, números y fechas (${file})`, async () => {
      const sheets = await readXlsx(fixture(file));
      expect(sheets.map(s => s.name)).toEqual(["Gastos 2024", "Caja 2025"]);
      const [gastos, caja] = sheets;
      expect(gastos.rows[0][0]).toBe("Mis gastos 2024");
      expect(gastos.rows[2]).toEqual(["Fecha", "Concepto", "Categoría", "Importe", "Medio de pago"]);
      expect(gastos.rows[3]).toEqual(["2024-01-05", "Supermercado Coto", "Comida", 45230.5, "Débito"]);
      expect(caja.rows[2]).toEqual(["16/01/2025", "Expensas", "", 98000]);
    });
  }

  it("rechaza lo que no es un .xlsx", async () => {
    await expect(readXlsx(new TextEncoder().encode("hola, no soy un excel"))).rejects.toThrow(/Excel/);
  });

  it("convierte los números de serie y reconoce formatos de fecha", () => {
    expect(serialToDate(45296)).toBe("2024-01-05");
    expect(serialToDate(1, true)).toBe("1904-01-02");
    expect(isDateFormat("dd/mm/yyyy")).toBe(true);
    expect(isDateFormat("[$-es-AR]d \\de mmmm \\de yyyy")).toBe(true);
    expect(isDateFormat('"$" #,##0.00')).toBe(false);
    expect(isDateFormat("0.00%")).toBe(false);
  });
});

describe("planilla propia", () => {
  it("salta el título y encuentra los encabezados", () => {
    const { headers, data } = readTable([
      ["Mis gastos 2024"],
      [],
      ["Fecha", "Concepto", "$"],
      ["2024-01-05", "Café", 2500],
    ]);
    expect(headers).toEqual(["Fecha", "Concepto", "$"]);
    expect(data).toEqual([["2024-01-05", "Café", 2500]]);
  });

  it("sin encabezados nombra las columnas por su letra", () => {
    expect(readTable([["2024-01-05", "Café", 2500]]).headers).toEqual(["Columna A", "Columna B", "Columna C"]);
  });

  it("adivina las columnas por el nombre, con o sin acentos", () => {
    expect(guessMapping(["Fecha", "Concepto", "Categoría", "Importe", "Medio de pago"])).toEqual({
      date: "Fecha",
      description: "Concepto",
      category: "Categoría",
      amount: "Importe",
      paymentMethod: "Medio de pago",
    });
    expect(guessMapping(["Día", "Detalle", "Ingresos", "Gastos"])).toEqual({
      date: "Día",
      description: "Detalle",
      income: "Ingresos",
      amount: "Gastos",
    });
  });

  it("entiende fechas, montos y monedas como se escriben en Argentina", () => {
    expect(parseDate("31/12/2024")).toBe("2024-12-31");
    expect(parseDate("3/2/25")).toBe("2025-02-03");
    expect(parseDate("2024-12-31")).toBe("2024-12-31");
    expect(parseDate("31/02/2024")).toBe("");
    expect(parseDate(45296)).toBe("2024-01-05");
    expect(parseDate("Total")).toBe("");
    expect(parseAmount("$ 1.234,50")).toBe(1234.5);
    expect(parseAmount("-1.234,50")).toBe(-1234.5);
    expect(parseAmount("(500)")).toBe(-500);
    expect(parseAmount("")).toBe(0);
    expect(parseCurrency("US$", "ARS")).toBe("USD");
    expect(parseCurrency("Pesos", "USD")).toBe("ARS");
    expect(parseCurrency("", "ARS")).toBe("ARS");
  });

  it("importa la planilla real: omite títulos, vacías y totales, y separa ingresos de gastos", async () => {
    const sheets = (await readXlsx(fixture("planilla-libreoffice.xlsx"))).map(s => ({
      name: s.name,
      ...readTable(s.rows),
    }));
    const [gastos, caja] = sheets;

    const a = buildMovements([gastos], guessMapping(gastos.headers));
    expect(a.expenses).toHaveLength(5);
    expect(a.incomes).toHaveLength(0);
    expect(a.expenses[0]).toEqual({
      description: "Supermercado Coto",
      amount: 45230.5,
      currency: "ARS",
      date: "2024-01-05",
      category: "Comida",
      paymentMethod: "Débito",
    });
    expect(a.rule).toBe("Todo entra como gasto.");
    expect([a.first, a.last]).toEqual(["2024-01-05", "2024-03-01"]);

    const b = buildMovements([caja], guessMapping(caja.headers));
    expect(b.incomes.map(i => [i.description, i.amount, i.date])).toEqual([
      ["Sueldo enero", 950000, "2025-01-15"],
      ["Venta bicicleta", 120000, "2025-02-03"],
    ]);
    expect(b.expenses.map(e => e.description)).toEqual(["Expensas", "Netflix"]);

    // Las dos hojas juntas: cada una usa sus columnas aunque se llamen distinto
    const both = buildMovements(sheets, guessMapping([...new Set(sheets.flatMap(s => s.headers))]));
    expect([both.expenses.length, both.incomes.length]).toEqual([7, 2]);
  });

  it("con montos negativos y positivos, los negativos son gastos", () => {
    const sheet = readTable([
      ["Fecha", "Descripción", "Monto"],
      ["01/03/2024", "Sueldo", "1.000.000"],
      ["02/03/2024", "Luz", "-25.000"],
    ]);
    const r = buildMovements([sheet], guessMapping(sheet.headers));
    expect(r.incomes.map(i => i.description)).toEqual(["Sueldo"]);
    expect(r.expenses.map(e => [e.description, e.amount])).toEqual([["Luz", 25000]]);
  });

  it("con columna de tipo, decide por lo que dice", () => {
    const sheet = readTable([
      ["Fecha", "Descripción", "Tipo", "Monto"],
      ["01/03/2024", "Sueldo", "Ingreso", 1000],
      ["02/03/2024", "Luz", "Gasto", 200],
    ]);
    const r = buildMovements([sheet], guessMapping(sheet.headers));
    expect([r.incomes.length, r.expenses.length]).toEqual([1, 1]);
  });

  it("no repite lo que ya estaba cargado y respeta el año desde", () => {
    const sheet = readTable([
      ["Fecha", "Descripción", "Monto"],
      ["01/03/2023", "Luz", 100],
      ["01/03/2024", "Luz", 200],
      ["01/04/2024", "Gas", 300],
    ]);
    const existing = [{ description: "luz", amount: 200, currency: "ARS", date: "2024-03-01" }];
    const r = buildMovements([sheet], guessMapping(sheet.headers), { existing, from: "2024-01-01" });
    expect(r.expenses.map(e => e.description)).toEqual(["Gas"]);
    expect(r.duplicates).toBe(1);
  });

  it("guarda los movimientos y crea las categorías que faltan", () => {
    const state = Store.state;
    const before = state.categories.length;
    applyMovements(
      state,
      {
        expenses: [
          {
            description: "Coto",
            amount: 100,
            currency: "ARS",
            date: "2024-01-05",
            category: "comida",
            paymentMethod: "",
          },
          {
            description: "Clases de tango",
            amount: 50,
            currency: "ARS",
            date: "2024-01-06",
            category: "Hobbies",
            paymentMethod: "",
          },
        ],
        incomes: [{ description: "Sueldo", amount: 1000, currency: "ARS", date: "2024-01-01", source: "sueldo" }],
      },
      "otros",
    );
    expect(state.expenses).toHaveLength(2);
    expect(state.categories).toHaveLength(before + 1);
    expect(state.categories.at(-1).name).toBe("Hobbies");
    expect(state.incomes[0].sourceId).toBe("sueldo");
  });
});
