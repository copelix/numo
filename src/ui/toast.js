import { html } from "../lib/html.js";
import { $ } from "../lib/utils.js";

/* =========================================================================
   9. AVISOS Y MODALES
   ========================================================================= */
export const Toast = {
  timer: null,
  show(message, { actionLabel, onAction, duration = 4500 } = {}) {
    const el = $("#toast");
    el.innerHTML = String(html`<span>${message}</span>${actionLabel && html`<button type="button" class="btn btn--compact">${actionLabel}</button>`}`);
    if (actionLabel) $("button", el).addEventListener("click", () => { this.hide(); onAction?.(); }, { once: true });
    el.classList.add("is-visible");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), actionLabel ? duration + 2500 : duration);
  },
  hide() { $("#toast").classList.remove("is-visible"); },
};
