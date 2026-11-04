import { Store } from "./store.js";

/* =========================================================================
   3. MONEDAS
   ========================================================================= */
export const Money = {
  formatters: new Map(),
  get base() {
    return Store.state.settings.baseCurrency;
  },
  rate(currency) {
    const r = Store.state.settings.rates[currency];
    return r > 0 ? r : 1;
  },
  /** Convierte pasando por USD (las tasas son "unidades por 1 USD"). */
  convert(amount, from, to = this.base) {
    return from === to ? amount : (amount / this.rate(from)) * this.rate(to);
  },
  /** Impuestos al pagar en pesos con tarjeta en moneda extranjera, en %. */
  cardTax() {
    return Number(Store.state?.settings?.cardTax) || 0;
  },
  /** Lo que sale de verdad en tu moneda: con los impuestos de la tarjeta si corresponde. */
  cost(item) {
    const value = this.convert(item.amount, item.currency);
    return item.cardTax && item.currency !== "ARS" ? value * (1 + this.cardTax() / 100) : value;
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
