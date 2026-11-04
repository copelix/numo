import { DEFAULT_IPC } from "../config.js";
import { Store } from "./store.js";
import { Dates } from "../lib/dates.js";

/* =========================================================================
   6b. INFLACIÓN: llevar pesos de un mes a pesos de otro con el IPC
   ========================================================================= */
export const Inflation = {
  /** Valores del INDEC más lo que cargaste o corregiste vos. */
  table() {
    return { ...DEFAULT_IPC, ...(Store.state?.settings?.ipc ?? {}) };
  },
  rate(key) {
    const v = this.table()[key];
    return Number.isFinite(v) ? v : undefined;
  },
  lastKnown() {
    return Object.keys(this.table()).sort().pop();
  },
  /** El último mes que el INDEC ya debería haber publicado (sale a mediados del mes siguiente). */
  expectedLatest() {
    return Dates.monthKey(new Date().getDate() >= 16 ? -1 : -2);
  },
  missing() {
    const out = [];
    for (
      let k = Dates.shiftMonth(this.lastKnown(), 1), guard = 0;
      k <= this.expectedLatest() && guard < 24;
      k = Dates.shiftMonth(k, 1), guard++
    )
      out.push(k);
    return out;
  },
  /** Cuánto subieron los precios entre el mes "from" y el mes "to" (multiplicador). Sin dato, usa el último conocido. */
  factor(from, to) {
    let factor = 1;
    const estimated = [];
    const fallback = this.rate(this.lastKnown()) ?? 0;
    for (let k = Dates.shiftMonth(from, 1), guard = 0; k <= to && guard < 240; k = Dates.shiftMonth(k, 1), guard++) {
      let r = this.rate(k);
      if (r === undefined) {
        r = fallback;
        estimated.push(k);
      }
      factor *= 1 + r / 100;
    }
    return { factor, estimated };
  },
  /** Variación acumulada de una lista de meses (en %), solo con meses conocidos. */
  accumulated(keys) {
    const known = keys.filter(k => this.rate(k) !== undefined);
    return { pct: (known.reduce((f, k) => f * (1 + this.rate(k) / 100), 1) - 1) * 100, months: known.length };
  },
  pct: value =>
    `${value >= 0 ? "+" : ""}${value.toLocaleString("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: value !== 0 && Math.abs(value) < 10 ? 1 : 0 })}%`,
};
