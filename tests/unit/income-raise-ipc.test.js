import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Finance } from "../../src/core/finance.js";
import { Inflation, IpcSync } from "../../src/core/inflation.js";
import { Schema } from "../../src/core/schema.js";
import { Store } from "../../src/core/store.js";
import { Dates } from "../../src/lib/dates.js";

const today = Dates.today();
const monthsAgo = n => Dates.addMonths(today, -n, Dates.dayOf(today));

beforeEach(() => {
  Store.state = Schema.normalize({ version: 2 });
  vi.spyOn(Store, "save").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("aumento de un ingreso fijo", () => {
  const template = raises => ({
    id: "t1",
    description: "Mensualidad",
    amount: 100000,
    currency: "ARS",
    date: monthsAgo(4),
    sourceId: "sueldo",
    recurring: true,
    raises,
  });

  it("los cobros anteriores al aumento quedan como estaban y los siguientes usan el monto nuevo", () => {
    Store.state = Schema.normalize({ version: 2, incomes: [template([{ from: monthsAgo(2), amount: 120000 }])] });
    Finance.settle();
    const generated = Store.state.incomes
      .filter(i => i.templateId === "t1")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(i => i.amount);
    expect(generated).toEqual([100000, 120000, 120000, 120000]);
    // El ingreso original (su primer mes) no cambia
    expect(Store.state.incomes.find(i => i.id === "t1").amount).toBe(100000);
    expect(Finance.amountOn(Store.state.incomes[0], today)).toBe(120000);
    expect(Finance.fixedIncomeMonthly()).toBe(120000);
  });

  it("un aumento que todavía no empezó se ve como pendiente", () => {
    const next = Dates.addMonths(today, 1, Dates.dayOf(monthsAgo(4)));
    Store.state = Schema.normalize({ version: 2, incomes: [template([{ from: next, amount: 130000 }])] });
    Finance.settle();
    const t = Store.state.incomes.find(i => i.id === "t1");
    expect(Finance.pendingRaise(t)).toEqual({ from: next, amount: 130000 });
    expect(Finance.fixedIncomeMonthly()).toBe(100000);
  });

  it("descarta aumentos inválidos y solo los guarda en el ingreso fijo", () => {
    const s = Schema.normalize({
      version: 2,
      incomes: [
        template([
          { from: "2026-13-01", amount: 5 },
          { from: "2026-12-01", amount: 0 },
          { from: "2026-12-01", amount: "150.000" },
        ]),
        { ...template([{ from: "2026-12-01", amount: 1 }]), id: "x", recurring: false },
      ],
    });
    expect(s.incomes[0].raises).toEqual([{ from: "2026-12-01", amount: 150000 }]);
    expect(s.incomes[1].raises).toBeUndefined();
  });
});

describe("inflación automática", () => {
  it("lee la serie oficial y la de respaldo", () => {
    expect(
      IpcSync.parseOfficial({
        data: [
          ["2026-10-01", 0.021719],
          ["2026-09-01", 0.019359],
          ["2026-08-01", null],
        ],
      }),
    ).toEqual({ "2026-10": 2.2, "2026-09": 1.9 });
    expect(
      IpcSync.parseBackup([
        { fecha: "1943-03-31", valor: 1.6 },
        { fecha: "2026-10-31", valor: 2.2 },
        { fecha: "mal", valor: 3 },
      ]),
    ).toEqual({ "2026-10": 2.2 });
    expect(IpcSync.parseOfficial(null)).toEqual({});
  });

  it("un mes que llega del INDEC reemplaza al que habías cargado a mano mientras faltaba", () => {
    Store.state.settings.ipc = { "2030-10": 2.5 };
    expect(IpcSync.apply({ "2030-10": 2.2 })).toBe(true);
    expect(Store.state.settings.ipc).toEqual({});
    expect(Inflation.rate("2030-10")).toBe(2.2);
    expect(Inflation.isOfficial("2030-10")).toBe(true);
  });

  it("una corrección tuya de un mes que ya había llegado se respeta, y sin cambios no guarda", () => {
    Store.state.settings.ipcOfficial = { "2030-10": 2.2 };
    Store.state.settings.ipc = { "2030-10": 2.3 };
    expect(IpcSync.apply({ "2030-10": 2.2 })).toBe(false);
    expect(Inflation.rate("2030-10")).toBe(2.3);
    expect(Store.save).not.toHaveBeenCalled();
  });

  it("prueba la fuente de respaldo si la oficial falla", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ fecha: "2030-11-30", valor: 1.8 }])));
    expect(await IpcSync.refresh({ force: true })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(Inflation.rate("2030-11")).toBe(1.8);
  });
});
