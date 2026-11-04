import { Actions } from "./actions.js";
import { Router } from "./router.js";
import { UIState } from "./state.js";
import { DEFAULT_IPC, ROUTES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Inflation } from "../core/inflation.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { $, clamp, isNumberText, numberText, toNumber } from "../lib/utils.js";
import { Sync } from "../sync/sync.js";
import { icon } from "../ui/icons.js";
import { Modal } from "../ui/modal.js";
import { Motion } from "../ui/motion.js";
import { Theme } from "../ui/theme.js";
import { Toast } from "../ui/toast.js";
import { AfterRender, Views } from "../views/index.js";

export const App = {
  renderNav(current) {
    const section = ROUTES.find(r => r.id === current)?.parent ?? current;
    const links = wide => ROUTES.filter(r => r.main).map(r => html`<a class="nav__link" href="#/${r.id}"${attrs({ "aria-current": r.id === section ? "page" : false })}>${icon(r.icon)}<span>${wide ? (r.wide ?? r.label) : r.label}</span></a>`);
    $(".nav--top").innerHTML = String(html`${links(true)}`);
    $(".nav--tabbar").innerHTML = String(html`${links(false)}`);
    // El "+" de arriba se adapta: en Suscripciones agrega una suscripción; en el resto pregunta gasto o ingreso
    const add = $("#topbar-add");
    const target = current === "suscripciones" ? ["new-subscription", "Nueva suscripción"]
      : current === "movimientos" && UIState.movementType === "gastos" ? ["new-expense", "Nuevo gasto"]
      : current === "movimientos" && UIState.movementType === "ingresos" ? ["new-income", "Nuevo ingreso"]
      : ["new-entry", "Agregar"];
    add.dataset.action = target[0];
    add.title = target[1];
    add.setAttribute("aria-label", target[1]);
    $(".btn__label", add).textContent = target[1];
  },

  /** Redibuja la vista actual y devuelve el foco al campo donde estabas. */
  render({ resetScroll = false } = {}) {
    Theme.apply();
    const view = Router.current();
    const main = $("#main");
    if (!Store.state) {
      this.renderNav(view);
      main.innerHTML = String(html`<div class="loading" role="status"><span class="loading__mark" aria-hidden="true"></span><p>Cargando tus datos…</p></div>`);
      return;
    }
    const active = document.activeElement;
    const focusId = active?.id && main.contains(active) ? active.id : null;
    let selection = null;
    try { selection = focusId ? [active.selectionStart, active.selectionEnd] : null; } catch (error) { selection = null; }

    this.renderNav(view);
    main.innerHTML = String(html`${Views[view]()}${Views.footer()}`);
    AfterRender[view]?.();
    const entering = resetScroll || !this.rendered || this.animateNext;
    this.rendered = true;
    this.animateNext = false;
    if (entering) { Motion.enter(main); Motion.countUp(main); }

    if (focusId) {
      const el = document.getElementById(focusId);
      el?.focus({ preventScroll: true });
      try { if (selection && selection[0] !== null) el.setSelectionRange(...selection); } catch (error) { /* campos sin selección */ }
    }
    if (resetScroll) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
  },

  /** Cambia el mes del Inicio (dirección -1/+1, o "today" para volver). */
  setHomeMonth(dir) {
    const next = dir === "today" ? 0 : Math.max(-11, Math.min(0, UIState.homeOffset + dir));
    if (next === UIState.homeOffset) return;
    UIState.homeOffset = next;
    this.animateNext = true;
    this.render();
  },

  /** Lleva a Movimientos con filtros puestos (desde un gráfico). */
  drill({ type = "todo", categoryId = "", from = "", to = "" }, message) {
    UIState.movementType = type;
    UIState.filters = { q: "", categoryId, from, to };
    UIState.expenseLimit = 60;
    Router.go("movimientos");
    if (message) Toast.show(message, { actionLabel: "Quitar filtros", onAction: () => Actions["clear-filters"]() });
  },

  /** Pone al día cobros y gastos mensuales; guarda solo si cambió algo. */
  settle() {
    if (Store.state && Sync.mode !== "connecting" && Finance.settle()) Store.save();
  },

  markPaid(id) {
    const sub = Store.state.subscriptions.find(s => s.id === id);
    if (!sub) return;
    Store.commitWithUndo(`Registraste el pago de ${sub.name}. Próximo cobro: ${Dates.formatShort(Dates.addPeriod(sub.nextDate, sub.frequency, sub.anchorDay))}.`, state => {
      const target = state.subscriptions.find(s => s.id === id);
      state.expenses.push(Finance.expenseFromSubscription(target, Dates.today()));
      target.nextDate = Dates.addPeriod(target.nextDate, target.frequency, target.anchorDay);
    });
  },

  updateSetting(input) {
    const key = input.dataset.setting;
    let value;
    if (input.type === "checkbox") value = input.checked;
    else if (key === "monthlyBudget") value = Math.max(0, toNumber(input.value));
    else if (key === "remindDays") value = Number(input.value);
    else if (key === "cardTax") value = clamp(toNumber(input.value), 0, 200);
    else value = input.value;
    Store.commit(state => { state.settings[key] = value; });
    if (key === "theme") Theme.apply();
    if (key === "autoLogSubscriptions" && value) this.settle();
  },

  updateRate(input) {
    const currency = input.dataset.rate;
    const value = toNumber(input.value);
    if (value <= 0) {
      input.value = Store.state.settings.rates[currency];
      Toast.show("El tipo de cambio tiene que ser mayor a cero.");
      return;
    }
    Store.commit(state => { state.settings.rates[currency] = value; });
  },

  /** Inflación de un mes: vacío vuelve al dato del INDEC (o lo deja sin dato). */
  updateIpc(input) {
    const key = input.dataset.ipc;
    const raw = input.value.trim();
    const value = raw === "" ? null : toNumber(raw);
    if (value !== null && (!isNumberText(raw) || value < -50 || value > 100)) {
      Toast.show("Escribí la inflación del mes en %, por ejemplo 2,3.");
      input.value = Inflation.rate(key) === undefined ? "" : numberText(Inflation.rate(key));
      return;
    }
    Store.commit(state => {
      if (value === null || DEFAULT_IPC[key] === value) delete state.settings.ipc[key];
      else state.settings.ipc[key] = value;
    });
  },

  updateCategoryBudget(input) {
    const id = input.dataset.budget;
    const value = Math.max(0, toNumber(input.value));
    Store.commit(state => {
      if (value > 0) state.categoryBudgets[id] = value;
      else delete state.categoryBudgets[id];
    });
  },

  setFilterRange(which) {
    const key = Dates.monthKey(which === "last" ? -1 : 0);
    const first = Dates.parse(`${key}-01`);
    UIState.filters.from = `${key}-01`;
    UIState.filters.to = `${key}-${Dates.pad(Dates.daysInMonth(first.getFullYear(), first.getMonth()))}`;
    UIState.expenseLimit = 60;
    this.render();
  },

  async resetAll() {
    const ok = await Modal.confirm({
      title: "Borrar todo",
      message: "Se borran suscripciones, gastos, ingresos, cuotas, cuentas compartidas, metas y topes. Las categorías y los ajustes se mantienen.",
      confirmLabel: "Borrar todo", danger: true,
    });
    if (!ok) return;
    Store.commitWithUndo("Borraste todos tus datos.", state => {
      state.subscriptions = []; state.expenses = []; state.incomes = []; state.goals = []; state.categoryBudgets = {};
      state.installments = []; state.shared = [];
    });
  },

};
