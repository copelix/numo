import { Store } from "./store.js";

/* =========================================================================
   3. MONEDAS
   ========================================================================= */
export const Money = {
  formatters: new Map(),
  get base() {
    return Store.state.settings.baseCurrency;
  },
  /** Unidades de la moneda por 1 USD. Con tarjeta, el peso va siempre al dólar oficial (así cobran los bancos),
      aunque elijas MEP o blue para el resto. */
  rate(currency, { card = false } = {}) {
    const s = Store.state.settings;
    if (card && currency === "ARS" && s.dolar?.source !== "manual" && s.dolar?.oficial > 0) return s.dolar.oficial;
    const r = s.rates[currency];
    return r > 0 ? r : 1;
  },
  /** Convierte pasando por USD (las tasas son "unidades por 1 USD"). */
  convert(amount, from, to = this.base, options) {
    return from === to ? amount : (amount / this.rate(from, options)) * this.rate(to, options);
  },
  /** Impuestos al pagar en pesos con tarjeta en moneda extranjera, en %. */
  cardTax() {
    return Number(Store.state?.settings?.cardTax) || 0;
  },
  /** Lo que sale de verdad en tu moneda: con los impuestos de la tarjeta si corresponde. */
  cost(item) {
    const card = Boolean(item.cardTax) && item.currency !== "ARS";
    const value = this.convert(item.amount, item.currency, this.base, { card });
    return card ? value * (1 + this.cardTax() / 100) : value;
  },
  /** Pesos por dólar pagando con tarjeta: oficial + impuestos. */
  cardRate() {
    return this.rate("ARS", { card: true }) * (1 + this.cardTax() / 100);
  },
  format(amount, currency = this.base) {
    if (!this.formatters.has(currency)) {
      try {
        this.formatters.set(
          currency,
          new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: currency === "CLP" ? 0 : 2,
          }),
        );
      } catch {
        this.formatters.set(currency, { format: n => `${currency} ${n.toFixed(2)}` });
      }
    }
    return this.formatters.get(currency).format(Number(amount) || 0);
  },
  compact(amount) {
    return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(amount || 0);
  },
};
