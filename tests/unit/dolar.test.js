import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dolar } from "../../src/core/dolar.js";
import { Money } from "../../src/core/money.js";
import { Schema } from "../../src/core/schema.js";
import { Store } from "../../src/core/store.js";

/* Lo que devuelve https://dolarapi.com/v1/dolares (recortado). */
const LIST = [
  {
    moneda: "USD",
    casa: "oficial",
    nombre: "Oficial",
    compra: 1520,
    venta: 1570,
    fechaActualizacion: "2026-11-03T18:55:00.000Z",
  },
  {
    moneda: "USD",
    casa: "blue",
    nombre: "Blue",
    compra: 1550,
    venta: 1595,
    fechaActualizacion: "2026-11-04T11:55:00.000Z",
  },
  {
    moneda: "USD",
    casa: "bolsa",
    nombre: "Bolsa",
    compra: 1575.3,
    venta: 1581.1,
    fechaActualizacion: "2026-11-04T11:55:00.000Z",
  },
];

beforeEach(() => {
  Store.state = Schema.normalize({ version: 2, settings: { rates: { ARS: 1450 }, cardTax: 30 } });
  vi.spyOn(Store, "save").mockImplementation(() => {});
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("dólar automático", () => {
  it("arranca en automático con el oficial, también para quien ya tenía datos", () => {
    expect(Store.state.settings.dolar).toEqual({ source: "oficial", oficial: 0, quoteAt: "" });
    expect(
      Schema.normalize({ version: 2, settings: { dolar: { source: "cualquiera", oficial: -5 } } }).settings.dolar
        .source,
    ).toBe("oficial");
  });

  it("toma el precio de venta de la cotización elegida", () => {
    expect(Dolar.pick(LIST, "blue")).toEqual({ venta: 1595, at: "2026-11-04T11:55:00.000Z" });
    expect(Dolar.pick(LIST, "tarjeta")).toBeNull();
    expect(Dolar.pick({ error: "caída" }, "oficial")).toBeNull();
  });

  it("actualiza el peso y guarda el oficial aparte", () => {
    expect(Dolar.apply(LIST)).toBe(true);
    expect(Store.state.settings.rates.ARS).toBe(1570);
    expect(Store.state.settings.dolar.oficial).toBe(1570);
    expect(Store.save).toHaveBeenCalledTimes(1);
    // Misma cotización: no vuelve a guardar (ni a subir a la nube).
    Dolar.apply(LIST);
    expect(Store.save).toHaveBeenCalledTimes(1);
  });

  it("con MEP o blue, lo pagado con tarjeta sigue yendo al oficial + impuestos", () => {
    Store.state.settings.dolar.source = "blue";
    Dolar.apply(LIST);
    expect(Money.cost({ amount: 10, currency: "USD" })).toBeCloseTo(15950);
    expect(Money.cost({ amount: 10, currency: "USD", cardTax: true })).toBeCloseTo(20410);
    expect(Money.cardRate()).toBeCloseTo(2041);
  });

  it("en manual no toca nada y usa lo que cargaste", async () => {
    Store.state.settings.dolar.source = "manual";
    Store.state.settings.dolar.oficial = 1570;
    expect(Dolar.apply(LIST)).toBe(false);
    expect(await Dolar.refresh({ force: true })).toBe(false);
    expect(Store.state.settings.rates.ARS).toBe(1450);
    expect(Money.cost({ amount: 10, currency: "USD", cardTax: true })).toBeCloseTo(18850);
  });

  it("sin conexión queda la última cotización", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await Dolar.refresh({ force: true })).toBe(false);
    expect(Store.state.settings.rates.ARS).toBe(1450);
    vi.unstubAllGlobals();
  });

  it("no consulta de nuevo antes de media hora", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => LIST });
    vi.stubGlobal("fetch", fetchMock);
    await Dolar.refresh();
    await Dolar.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
