import { DOLAR_API } from "../config.js";
import { Storage } from "../lib/storage.js";
import { Store } from "./store.js";

/* =========================================================================
   DÓLAR AUTOMÁTICO
   Trae la cotización de DolarAPI (pública y gratuita) al abrir la app y al
   volver a ella, como mucho cada media hora. Sin internet, o si la fuente no
   responde, queda la última cotización guardada y la app sigue igual.
   ========================================================================= */
export const Dolar = {
  MAX_AGE: 30 * 60 * 1000,
  CHECK_KEY: "numo:dolarCheckedAt",
  pending: null,

  /** Del listado de DolarAPI, el precio de venta de una casa ("oficial", "bolsa", "blue"). */
  pick(list, casa) {
    const quote = Array.isArray(list) ? list.find(q => q?.casa === casa) : null;
    const venta = Number(quote?.venta);
    if (!(venta > 0)) return null;
    const at = typeof quote.fechaActualizacion === "string" ? quote.fechaActualizacion : "";
    return { venta, at: Number.isNaN(Date.parse(at)) ? "" : at };
  },

  isAuto() {
    return Store.state?.settings?.dolar?.source !== "manual";
  },

  refresh({ force = false } = {}) {
    if (!Store.state || !this.isAuto()) return Promise.resolve(false);
    const checked = Number(Storage.read(this.CHECK_KEY)) || 0;
    if (!force && Date.now() - checked < this.MAX_AGE) return Promise.resolve(false);
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  },

  async load() {
    try {
      const response = await fetch(DOLAR_API, { cache: "no-store" });
      if (!response.ok) return false;
      return this.apply(await response.json());
    } catch {
      return false; // sin conexión o fuente caída: queda la última cotización
    }
  },

  /** Usa el listado de DolarAPI. Solo guarda si algo cambió, para no subir a la nube por nada. */
  apply(list) {
    if (!this.isAuto()) return false;
    const dolar = Store.state.settings.dolar;
    const chosen = this.pick(list, dolar.source);
    if (!chosen) return false;
    const oficial = this.pick(list, "oficial")?.venta ?? dolar.oficial;
    Storage.write(this.CHECK_KEY, Date.now());
    const same =
      Store.state.settings.rates.ARS === chosen.venta && dolar.oficial === oficial && dolar.quoteAt === chosen.at;
    if (!same) {
      Store.commit(state => {
        state.settings.rates.ARS = chosen.venta;
        state.settings.dolar.oficial = oficial;
        state.settings.dolar.quoteAt = chosen.at;
      });
    }
    return true;
  },
};
