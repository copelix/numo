import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_TAX } from "../../src/config.js";
import { createInitialState, Schema } from "../../src/core/schema.js";

describe("Schema.normalize", () => {
  it("cualquier cosa rara se convierte en un estado válido", () => {
    for (const raw of [null, 42, "hola", [], { version: 99 }]) {
      const s = Schema.normalize(raw);
      expect(s.expenses).toEqual([]);
      expect(s.settings.baseCurrency).toBe("ARS");
      expect(s.settings.cardTax).toBe(DEFAULT_CARD_TAX);
    }
  });

  it("descarta gastos sin descripción o con fecha inválida y corrige el resto", () => {
    const s = Schema.normalize({
      version: 2,
      expenses: [
        { description: "Ok", amount: "1.500", currency: "XXX", date: "2026-05-04", categoryId: "no-existe" },
        { description: "", amount: 10, date: "2026-05-04" },
        { description: "Mala fecha", amount: 10, date: "2026-13-40" },
      ],
    });
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0]).toMatchObject({ amount: 1500, currency: "ARS", categoryId: "otros" });
  });

  it("valida compras en cuotas", () => {
    const ok = Schema.installment(
      { description: "Heladera", amount: 54000, count: 500, firstDate: "2026-08-10", done: 999 },
      { ids: new Set(["hogar"]), fallback: "hogar" },
    );
    expect(ok).toMatchObject({ count: 120, done: 120, categoryId: "hogar" });
    expect(
      Schema.installment(
        { description: "Sin monto", amount: 0, count: 3, firstDate: "2026-08-10" },
        { ids: new Set(), fallback: "x" },
      ),
    ).toBeNull();
  });

  it("una cuenta compartida necesita al menos dos personas", () => {
    expect(Schema.sharedEvent({ name: "Solo", people: ["Yo"] })).toBeNull();
    const ev = Schema.sharedEvent({
      name: "Viaje",
      people: ["Yo", "Sofía"],
      items: [{ description: "Nafta", amount: 100, paidBy: 9, among: [7, 1, 1] }],
    });
    expect(ev.items[0]).toMatchObject({ paidBy: 1, among: [1] });
  });

  it("guarda solo meses válidos de inflación", () => {
    const s = Schema.normalize({ version: 2, settings: { ipc: { "2026-10": 2.4, octubre: 3, "2026-11": "" } } });
    expect(s.settings.ipc).toEqual({ "2026-10": 2.4 });
  });

  it("el estado inicial trae todas las colecciones", () => {
    expect(Object.keys(createInitialState())).toEqual(
      expect.arrayContaining(["subscriptions", "expenses", "incomes", "goals", "installments", "shared"]),
    );
  });
});
