import { Store } from "../core/store.js";
import { Storage } from "../lib/storage.js";

/* ---------- Tema: del sistema, claro u oscuro ---------- */
export const Theme = {
  OPTIONS: [
    ["system", "Predeterminado del sistema"],
    ["light", "Claro"],
    ["dark", "Oscuro"],
  ],
  KEY: "numo:theme",
  media: matchMedia("(prefers-color-scheme: light)"),
  /** La preferencia: la guardada en tus datos o, mientras cargan, la de este dispositivo. */
  preference() {
    return Store.state?.settings?.theme ?? Storage.read(this.KEY) ?? "system";
  },
  resolved(pref = this.preference()) {
    if (pref === "light" || pref === "dark") return pref;
    return this.media.matches ? "light" : "dark";
  },
  apply() {
    const pref = this.preference();
    const theme = this.resolved(pref);
    const root = document.documentElement;
    if (root.dataset.numoTheme !== theme) root.dataset.numoTheme = theme;
    Storage.write(this.KEY, pref);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
    }
    meta.content = theme === "light" ? "#f4f4f5" : "#040506";
  },
};
