import { Store } from "../core/store.js";
import { Storage } from "../lib/storage.js";
import { Sync } from "./sync.js";

/** Que el navegador no borre los datos de Numo por su cuenta cuando le falta espacio. */
export const Persist = {
  async ask() {
    try {
      if (!navigator.storage?.persist) return;
      if (await navigator.storage.persisted()) return;
      await navigator.storage.persist();
    } catch { /* no todos los navegadores lo permiten: no pasa nada */ }
  },
};
/** Recordatorio de copia para quien guarda solo en el navegador. */
export const Backup = {
  KEY: "numo:lastBackup",
  DISMISS_KEY: "numo:backupNudge",
  DAYS: 30,
  mark() { Storage.write(this.KEY, Date.now()); },
  due() {
    if (Sync.mode !== "local" || !Storage.available || !Store.hasUserData()) return false;
    const last = Number(Storage.read(this.KEY)) || 0;
    const snoozed = Number(Storage.read(this.DISMISS_KEY)) || 0;
    const day = 86400000;
    if (Date.now() - snoozed < 7 * day) return false;
    if (!last) {
      // primera vez: después de una semana de uso
      let first = Number(Storage.read("numo:firstUse"));
      if (!first) {
        first = Date.now();
        Storage.write("numo:firstUse", first);
      }
      return Date.now() - first > 7 * day;
    }
    return Date.now() - last > this.DAYS * day;
  },
  snooze() { Storage.write(this.DISMISS_KEY, Date.now()); },
};
