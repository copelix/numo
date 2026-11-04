/** localStorage con try/catch: nunca rompe la app si el navegador lo bloquea. */
export const Storage = {
  available: (() => {
    try { localStorage.setItem("__cc_test__", "1"); localStorage.removeItem("__cc_test__"); return true; }
    catch (error) { return false; }
  })(),
  warned: false,
  read(key) {
    if (!this.available) return null;
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (error) { console.warn(`No se pudo leer ${key}`, error); return null; }
  },
  write(key, value) {
    if (!this.available) return false;
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.warn(`No se pudo guardar ${key}`, error); return false; }
  },
  remove(key) {
    if (!this.available) return;
    try { localStorage.removeItem(key); } catch (error) { /* sin acceso: no hay nada que borrar */ }
  },
};
