import { DEFAULT_IPC, IPC_API, IPC_API_BACKUP } from "../config.js";
import { Storage } from "../lib/storage.js";
import { Store } from "./store.js";
import { Dates } from "../lib/dates.js";

/* =========================================================================
   6b. INFLACIÓN: llevar pesos de un mes a pesos de otro con el IPC
   ========================================================================= */
export const Inflation = {
  /** Los que trae la app, los que se bajaron solos del INDEC y, encima, lo que cargaste o corregiste vos. */
  table() {
    const s = Store.state?.settings;
    return { ...DEFAULT_IPC, ...(s?.ipcOfficial ?? {}), ...(s?.ipc ?? {}) };
  },
  /** ¿Este mes vino del INDEC (con la app o bajado solo)? */
  isOfficial(key) {
    return Object.hasOwn(DEFAULT_IPC, key) || Object.hasOwn(Store.state?.settings?.ipcOfficial ?? {}, key);
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

/* =========================================================================
   INFLACIÓN AUTOMÁTICA
   Al abrir la app (como mucho dos veces por día) busca el IPC publicado por el
   INDEC. Sin conexión, o si las fuentes no responden, sigue con lo que tiene.
   ========================================================================= */
export const IpcSync = {
  MAX_AGE: 12 * 60 * 60 * 1000,
  CHECK_KEY: "numo:ipcCheckedAt",
  pending: null,

  refresh({ force = false } = {}) {
    if (!Store.state) return Promise.resolve(false);
    const checked = Number(Storage.read(this.CHECK_KEY)) || 0;
    if (!force && Date.now() - checked < this.MAX_AGE) return Promise.resolve(false);
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  },

  async load() {
    for (const [url, parse] of [
      [IPC_API, this.parseOfficial],
      [IPC_API_BACKUP, this.parseBackup],
    ]) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const values = parse(await response.json());
        if (Object.keys(values).length) {
          Storage.write(this.CHECK_KEY, Date.now());
          return this.apply(values);
        }
      } catch {
        /* sin conexión o fuente caída: probamos la otra */
      }
    }
    return false;
  },

  /** datos.gob.ar: { data: [["2026-10-01", 0.0217…], …] } (variación como fracción). */
  parseOfficial(json) {
    const out = {};
    for (const [date, value] of Array.isArray(json?.data) ? json.data : []) {
      if (typeof date === "string" && Number.isFinite(value)) out[date.slice(0, 7)] = Math.round(value * 1000) / 10;
    }
    return clean(out);
  },

  /** ArgentinaDatos: [{ fecha: "2026-10-31", valor: 2.2 }, …] desde 1943; nos quedamos con los últimos 36. */
  parseBackup(list) {
    const out = {};
    for (const x of (Array.isArray(list) ? list : []).slice(-36)) {
      if (typeof x?.fecha === "string" && Number.isFinite(Number(x.valor)) && x.valor !== null)
        out[x.fecha.slice(0, 7)] = Number(x.valor);
    }
    return clean(out);
  },

  /**
   * Guarda los meses que llegaron. Si un mes llega por primera vez y lo habías cargado a mano
   * (porque todavía no estaba), se usa el del INDEC. Una corrección tuya de un mes que ya había
   * llegado se respeta. Solo guarda si algo cambió, para no subir a la nube por nada.
   */
  apply(values) {
    const settings = Store.state.settings;
    const before = settings.ipcOfficial ?? {};
    const changed = Object.entries(values).filter(([k, v]) => before[k] !== v);
    const arrived = changed.map(([k]) => k).filter(k => !Object.hasOwn(before, k) && Object.hasOwn(settings.ipc, k));
    if (!changed.length) return false;
    Store.commit(state => {
      state.settings.ipcOfficial = { ...before, ...values };
      for (const k of arrived) delete state.settings.ipc[k];
    });
    return true;
  },
};

/** Solo meses válidos y valores razonables (entre −50% y 100% mensual). */
function clean(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && k >= "2017-01" && v >= -50 && v <= 100),
  );
}
