import { beforeEach, describe, expect, it } from "vitest";
import { Inflation } from "../../src/core/inflation.js";
import { Schema } from "../../src/core/schema.js";
import { Shared } from "../../src/core/shared.js";
import { Store } from "../../src/core/store.js";

beforeEach(() => { Store.state = Schema.normalize({ version: 2 }); });

describe("inflación", () => {
  it("lleva pesos de un mes a otro con el IPC del INDEC", () => {
    expect(Inflation.factor("2026-08", "2026-09").factor).toBeCloseTo(1.019);
    expect(Inflation.accumulated(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]).pct).toBeCloseTo(23.7, 1);
  });
  it("sin dato usa el último publicado y lo marca como estimado", () => {
    const { estimated } = Inflation.factor("2026-09", "2026-11");
    expect(estimated).toEqual(["2026-10", "2026-11"]);
  });
  it("lo que carga la persona pisa al dato de fábrica", () => {
    Store.state.settings.ipc["2026-09"] = 3;
    expect(Inflation.rate("2026-09")).toBe(3);
  });
});

describe("gastos compartidos", () => {
  const ev = () => Schema.sharedEvent({
    name: "Viaje", people: ["Yo", "Sofía", "Martín", "Lucía"],
    items: [
      { description: "Alojamiento", amount: 240000, paidBy: 0 },
      { description: "Auto", amount: 96000, paidBy: 1 },
      { description: "Combustible", amount: 48000, paidBy: 2 },
    ],
  });
  it("calcula cuánto puso y cuánto le toca a cada uno", () => {
    expect(Shared.balances(ev()).map(r => Math.round(r.balance))).toEqual([144000, 0, -48000, -96000]);
  });
  it("resuelve con la menor cantidad de transferencias", () => {
    expect(Shared.transfers(ev())).toEqual([{ from: 3, to: 0, amount: 96000 }, { from: 2, to: 0, amount: 48000 }]);
  });
  it("divide solo entre los que participaron de cada gasto", () => {
    const e = Schema.sharedEvent({ name: "Cena", people: ["Yo", "Ana", "Leo"], items: [{ description: "Vino", amount: 9000, paidBy: 1, among: [1, 2] }] });
    expect(Shared.transfers(e)).toEqual([{ from: 2, to: 1, amount: 4500 }]);
  });
  it("arma un resumen para mandar al grupo", () => {
    const text = Shared.summary(ev());
    expect(text).toContain("Lucía le pasa");
    expect(text).toContain("Hecho con Numo");
  });
});
