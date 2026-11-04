import { Money } from "../core/money.js";
import { $$ } from "../lib/utils.js";

/* =========================================================================
   GESTOS Y MOVIMIENTO
   ========================================================================= */
export const Motion = {
  reduced: () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  /** Los montos con data-count suben desde 0 hasta su valor. */
  countUp(root = document) {
    if (this.reduced()) return;
    for (const el of $$("[data-count]", root)) {
      const target = Number(el.dataset.count) || 0;
      const start = performance.now(),
        dur = 750;
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / dur),
          e = 1 - (1 - t) ** 3;
        el.textContent = Money.format(Math.round(target * e));
        if (t < 1 && el.isConnected) requestAnimationFrame(step);
        else el.textContent = Money.format(target);
      };
      step();
    }
  },
  /** Entrada suave de la pantalla al cambiar de sección. */
  enter(main) {
    if (this.reduced()) return;
    main.classList.remove("is-entering");
    void main.offsetWidth;
    main.classList.add("is-entering");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => main.classList.remove("is-entering"), 900);
  },
};
