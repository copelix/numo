import { Actions } from "./actions.js";
import { App } from "./app.js";
import { Router } from "./router.js";
import { UIState } from "./state.js";
import { Store } from "../core/store.js";
import { Transfer } from "../core/transfer.js";
import { Forms } from "../forms/index.js";
import { $, debounce } from "../lib/utils.js";
import { Sync } from "../sync/sync.js";
import { Calendar } from "../ui/calendar.js";
import { Gestures } from "../ui/gestures.js";
import { Modal } from "../ui/modal.js";
import { MonthChart } from "../ui/month-chart.js";
import { Toast } from "../ui/toast.js";
import { Views } from "../views/index.js";

export function bindEvents() {
  document.addEventListener("click", event => {
    const calendarLink = event.target.closest("a[data-calendar]");
    if (calendarLink) {
      // No se frena el enlace: se abre Google Calendar y acá solo anotamos que se agregó
      const { calendar: kind, id } = calendarLink.dataset;
      setTimeout(() => Store.commit(state => {
        const list = kind === "subscription" ? state.subscriptions : state.expenses;
        const item = list.find(x => x.id === id);
        if (item) item.calendarKey = Calendar.key(item);
      }), 400);
      Toast.show("Se abrió Google Calendar: tocá Guardar para agendar el cobro.");
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      const target = link.getAttribute("href").slice(1);
      if (target.startsWith("/")) {
        Router.go(target.slice(1));
        if (link.dataset.scroll) requestAnimationFrame(() => document.getElementById(link.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      else document.getElementById(target)?.focus();
      return;
    }
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    if (el.dataset.swiped) return;              // fue un deslizamiento, no un toque
    const action = Actions[el.dataset.action];
    if (!action) return;
    event.preventDefault();
    if (!Store.state) return Toast.show("Esperá un segundo, estamos cargando tus datos.");
    action(el.dataset.id, el);
  });

  document.addEventListener("pointerdown", event => { Gestures.rowDown(event); Gestures.monthDown(event); });
  document.addEventListener("pointermove", event => Gestures.rowMove(event), { passive: true });
  document.addEventListener("pointerup", event => { Gestures.rowUp(); Gestures.monthUp(event); });
  document.addEventListener("pointercancel", () => { Gestures.rowUp(); Gestures.month = null; });

  document.addEventListener("change", event => {
    const t = event.target;
    if (t.matches("[data-setting]")) App.updateSetting(t);
    else if (t.matches("[data-rate]")) App.updateRate(t);
    else if (t.matches("[data-budget]")) App.updateCategoryBudget(t);
    else if (t.matches("[data-ipc]")) App.updateIpc(t);
    else if (t.matches("[data-filter]") && t.dataset.filter !== "q") {
      UIState.filters[t.dataset.filter] = t.value;
      UIState.expenseLimit = 60;
      App.render();
    } else if (t.id === "import-file" && t.files?.[0]) {
      Transfer.importFile(t.files[0]);
      t.value = "";
    }
  });

  const searchExpenses = debounce(() => Views.renderExpenseResults(), 150);
  window.addEventListener("resize", debounce(() => { if (Router.current() === "inicio") MonthChart.render(); }, 150));
  document.addEventListener("input", event => {
    if (event.target.matches('[data-filter="q"]')) {
      UIState.filters.q = event.target.value;
      UIState.expenseLimit = 60;
      searchExpenses();
    }
  });

  document.addEventListener("submit", event => {
    if (event.target.matches("[data-form]")) event.preventDefault();
  });

  // Escape cierra el modal pasando por nuestra lógica (resuelve las preguntas pendientes).
  $("#modal").addEventListener("cancel", event => { event.preventDefault(); Modal.close("cancel"); });

  // Tecla N: gasto nuevo (si no estás escribiendo).
  document.addEventListener("keydown", event => {
    if (!event.key) return;
    if (event.key === "Escape" && Modal.isOpen) { event.preventDefault(); Modal.close("cancel"); return; }
    const typing = event.target.closest?.("input, textarea, select, [contenteditable]");
    if (event.key.toLowerCase() === "n" && Store.state && !event.metaKey && !event.ctrlKey && !event.altKey && !typing && !Modal.isOpen) {
      event.preventDefault();
      Forms.expense();
    }
  });

  window.addEventListener("popstate", () => Router.sync());
  window.addEventListener("hashchange", () => Router.sync());
  window.addEventListener("online", () => Sync.push());

  // Al volver a la app: subir lo pendiente y poner el día al día (vencimientos que pasaron).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { if (Sync.status === "pending") Sync.push(); return; }
    App.settle();
    App.render();
  });
}
