import { beforeEach, describe, expect, it } from "vitest";
import { Finance } from "../../src/core/finance.js";
import { Money } from "../../src/core/money.js";
import { Schema } from "../../src/core/schema.js";
import { Store } from "../../src/core/store.js";
import { Dates } from "../../src/lib/dates.js";

const today = Dates.today();
const monthsAgo = n => Dates.addMonths(today, -n, Dates.dayOf(today));

beforeEach(() => {
  Store.state = Schema.normalize({ version: 2, settings: { rates: { ARS: 1450 }, cardTax: 30 } });
});

describe("dólar tarjeta", () => {
  it("suma los impuestos solo a lo que se paga con tarjeta en moneda extranjera", () => {
    expect(Money.cost({ amount: 10, currency: "USD", cardTax: true })).toBeCloseTo(18850);
    expect(Money.cost({ amount: 10, currency: "USD" })).toBeCloseTo(14500);
    expect(Money.cost({ amount: 1000, currency: "ARS", cardTax: true })).toBe(1000);
  });
});

describe("cuotas", () => {
  it("registra las cuotas que ya vencieron, una por mes, sin repetirlas", () => {
    const ctx = { ids: new Set(Store.state.categories.map(c => c.id)), fallback: "otros" };
    Store.state.installments.push(Schema.installment({ description: "Heladera", amount: 54000, count: 12, firstDate: monthsAgo(3) }, ctx));
    expect(Finance.settle()).toBe(4);
    expect(Finance.settle()).toBe(0);
    const cuotas = Store.state.expenses.filter(e => e.installmentId);
    expect(cuotas.map(e => e.installmentN)).toEqual([1, 2, 3, 4]);
    expect(Finance.installmentLeft(Store.state.installments[0])).toBe(8 * 54000);
    expect(Finance.upcoming().find(p => p.kind === "installment").name).toContain("cuota 5/12");
  });
});

describe("suscripciones", () => {
  it("registra como gasto cada cobro que ya pasó y mueve el próximo", () => {
    const ctx = { ids: new Set(Store.state.categories.map(c => c.id)), fallback: "otros" };
    Store.state.subscriptions.push(Schema.subscription({ name: "Spotify", amount: 4.99, currency: "USD", frequency: "mensual", nextDate: monthsAgo(2), cardTax: true }, ctx));
    expect(Finance.settle()).toBe(2);
    expect(Store.state.subscriptions[0].nextDate >= today).toBe(true);
    expect(Store.state.expenses.every(e => e.cardTax && e.subscriptionId)).toBe(true);
    expect(Finance.monthlyCost(Store.state.subscriptions[0])).toBeCloseTo(4.99 * 1450 * 1.3);
  });
});
