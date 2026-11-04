import { App } from "../app/app.js";
import { CONFIG } from "../config.js";
import { Schema } from "./schema.js";
import { Storage } from "../lib/storage.js";
import { deepClone, } from "../lib/utils.js";
import { Sync } from "../sync/sync.js";
import { Toast } from "../ui/toast.js";

/* =========================================================================
   5. ESTADO Y PERSISTENCIA
   ========================================================================= */
export const Store = {
  state: null,

  /** Copia guardada en este navegador: se muestra al instante mientras conecta con la cuenta. */
  readCache() {
    const cache = Storage.read(CONFIG.cacheKey);
    if (cache?.state) return { uid: cache.uid ?? null, state: cache.state };
    const legacy = CONFIG.legacyStorageKeys.map(key => Storage.read(key)).find(Boolean);
    return legacy ? { uid: null, state: legacy } : null;
  },

  persist() {
    if (!Storage.available || !this.state) return false;
    const ok = Storage.write(CONFIG.cacheKey, { uid: Sync.uid, state: this.state });
    if (!ok && !Storage.warned && Sync.mode === "local") {
      Storage.warned = true;
      Toast.show("No se pudo guardar en este navegador (¿memoria llena?). Exportá tus datos para no perderlos.", { duration: 8000 });
    }
    return ok;
  },

  /** Marca el cambio, guarda en el dispositivo, programa el guardado en la cuenta y redibuja. */
  save({ render = true } = {}) {
    this.state.meta.updatedAt = Date.now();
    this.persist();
    Sync.schedulePush();
    if (render) App.render();
  },

  commit(mutator, options) {
    mutator(this.state);
    this.save(options);
  },

  /** Igual que commit, pero ofrece "Deshacer" en el aviso. */
  commitWithUndo(message, mutator) {
    const snapshot = deepClone(this.state);
    this.commit(mutator);
    Toast.show(message, { actionLabel: "Deshacer", onAction: () => this.replace(snapshot, { touch: true }) });
  },

  replace(next, { touch = false } = {}) {
    this.state = Schema.normalize(next);
    if (touch) this.save();
    else { this.persist(); App.render(); }
  },

  hasUserData() {
    const s = this.state;
    return [...s.subscriptions, ...s.expenses, ...s.incomes, ...s.goals, ...s.installments, ...s.shared].some(item => !item.demo);
  },
  hasDemoData() {
    const s = this.state;
    return [...s.subscriptions, ...s.expenses, ...s.incomes, ...s.goals, ...s.installments, ...s.shared].some(item => item.demo);
  },
};
