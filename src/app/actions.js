import { App } from "./app.js";
import { Router } from "./router.js";
import { UIState } from "./state.js";
import { Demo } from "../core/demo.js";
import { Finance } from "../core/finance.js";
import { Shared } from "../core/shared.js";
import { Store } from "../core/store.js";
import { Transfer } from "../core/transfer.js";
import { Forms } from "../forms/index.js";
import { Dates } from "../lib/dates.js";
import { Storage } from "../lib/storage.js";
import { $ } from "../lib/utils.js";
import { Backup } from "../sync/backup.js";
import { Cloud } from "../sync/cloud.js";
import { Sync } from "../sync/sync.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";
import { Views } from "../views/index.js";

/** Acciones de los botones con data-action. Reciben (id, elemento). */
export const Actions = {
  "new-expense": () => Forms.expense(),
  "edit-expense": id => Forms.expense(id),
  "new-income": () => Forms.income(),
  "edit-income": id => Forms.income(id),
  "new-entry": () => Forms.entry(),
  "home-month": (_, el) => App.setHomeMonth(el.dataset.value === "today" ? "today" : Number(el.dataset.value)),
  "drill-category": (id, el) => {
    const cat = Finance.category(id);
    App.drill(
      { type: "gastos", categoryId: id, from: el.dataset.from, to: el.dataset.to },
      `Gastos de ${cat.name} del período.`,
    );
  },
  "drill-month": (_, el) => {
    const key = el.dataset.value,
      first = Dates.parse(`${key}-01`);
    App.drill(
      { from: `${key}-01`, to: `${key}-${Dates.pad(Dates.daysInMonth(first.getFullYear(), first.getMonth()))}` },
      `Movimientos de ${Dates.monthName(key)}.`,
    );
  },
  "new-subscription": () => Forms.subscription(),
  "edit-subscription": id => Forms.subscription(id),
  "new-goal": () => Forms.goal(),
  "edit-goal": id => Forms.goal(id),
  "contribute-goal": id => Forms.contribution(id),
  "new-category": () => Forms.category(),
  "edit-category": id => Forms.category(id),
  "calendar-prev": () => {
    UIState.calendarOffset = Math.max(0, UIState.calendarOffset - 1);
    App.render();
  },
  "calendar-next": () => {
    UIState.calendarOffset = Math.min(12, UIState.calendarOffset + 1);
    App.render();
  },
  "calendar-today": () => {
    UIState.calendarOffset = 0;
    App.render();
  },
  segment: (_, el) => {
    const value = el.dataset.value;
    UIState[el.dataset.key] = /^\d+$/.test(value) ? Number(value) : value;
    App.render();
  },
  "filter-range": (_, el) => App.setFilterRange(el.dataset.value),
  "clear-filters": () => {
    UIState.filters = { q: "", categoryId: "", from: "", to: "" };
    UIState.expenseLimit = 60;
    App.render();
  },
  "show-more-expenses": () => {
    UIState.expenseLimit += 60;
    Views.renderExpenseResults();
  },
  "export-json": () => Transfer.exportJSON(),
  "export-csv": () => Transfer.exportCSV(),
  import: () => $("#import-file").click(),
  "load-demo": () => {
    Store.commit(state => {
      Demo.add(state);
      Finance.settle();
    });
    Toast.show("Cargamos datos de ejemplo.");
  },
  "clear-demo": () => Store.commitWithUndo("Borraste los datos de ejemplo.", state => Demo.remove(state)),
  "reset-all": () => App.resetAll(),
  "sync-now": () => Sync.push(),
  "new-installment": () => Forms.installment(),
  "edit-installment": id => Forms.installment(id),
  "new-shared": () => Forms.shared(),
  "open-shared": id => {
    UIState.sharedId = id;
    if (Router.current() === "compartido") App.render({ resetScroll: true });
    else Router.go("compartido");
  },
  "edit-shared": id => Forms.shared(id),
  "add-shared-item": id => Forms.sharedItem(id),
  "edit-shared-item": (id, el) => Forms.sharedItem(el.dataset.event, id),
  "share-shared": id => Shared.share(id),
  "shared-mine": id => Forms.sharedMine(id),
  "toggle-shared-settled": id =>
    Store.commit(state => {
      const ev = state.shared.find(x => x.id === id);
      if (ev) {
        ev.settled = !ev.settled;
        delete ev.demo;
      }
    }),
  "auth-signup": () => Forms.auth("signup"),
  "auth-login": () => Forms.auth("login"),
  "auth-later": () => {
    Storage.write("numo:authNudge", Date.now());
    App.render();
  },
  "backup-later": () => {
    Backup.snooze();
    App.render();
  },
  "sign-out": async () => {
    const ok = await Modal.confirm({
      title: "Cerrar sesión",
      message: "Tus datos quedan guardados en tu cuenta. En este dispositivo se borran hasta que vuelvas a entrar.",
      confirmLabel: "Cerrar sesión",
    });
    if (!ok) return;
    await Sync.signOut();
    Router.go("inicio");
    Toast.show("Cerraste la sesión.");
  },
  "delete-account": async () => {
    const ok = await Modal.confirm({
      title: "Borrar tu cuenta",
      message:
        "Se borran tu cuenta y todos tus datos guardados en ella, para siempre. Si querés, antes bajá una copia en Más → Tus datos.",
      confirmLabel: "Borrar para siempre",
      danger: true,
    });
    if (!ok) return;
    try {
      await Cloud.deleteAccount();
      await Sync.signOut();
      Router.go("inicio");
      Toast.show("Borramos tu cuenta y tus datos.");
    } catch (error) {
      Toast.show(
        error?.code === "unavailable"
          ? "Sin conexión: probá de nuevo cuando tengas internet."
          : "No se pudo borrar la cuenta. Probá de nuevo en un rato.",
      );
    }
  },
};
