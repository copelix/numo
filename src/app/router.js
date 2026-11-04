import { App } from "./app.js";
import { ROUTES } from "../config.js";

/* =========================================================================
   14. APP: navegación, acciones y arranque
   ========================================================================= */
export const Router = {
  route: null,
  isValid: id => ROUTES.some(r => r.id === id),
  /** Permite abrir directo una sección con un ancla simple, por ejemplo #pagos. */
  fromURL() {
    try {
      const id = location.hash.replace(/^#\/?/, "");
      return this.isValid(id) ? id : null;
    } catch (error) { return null; }
  },
  current() {
    if (!this.route) this.route = this.fromURL() ?? "inicio";
    return this.route;
  },
  go(id) {
    if (!this.isValid(id)) id = "inicio";
    if (id === this.current()) { window.scrollTo(0, 0); return; }
    this.route = id;
    App.render({ resetScroll: true });
  },
  sync() {
    const id = this.fromURL();
    if (!id || id === this.route) return;
    this.route = id;
    App.render({ resetScroll: true });
  },
};
