import { App } from "../app/app.js";
import { Store } from "../core/store.js";
import { Forms } from "../forms/index.js";
import { $ } from "../lib/utils.js";
import { Modal } from "./modal.js";

export const Gestures = {
  isTouch: matchMedia("(pointer: coarse)").matches,
  THRESHOLD: 90,
  row: null,

  /** Deslizar un movimiento: a la izquierda borra, a la derecha edita. */
  rowDown(event) {
    const item = event.target.closest(".list--swipe .item--button");
    if (!item || (event.pointerType === "mouse" && event.button !== 0)) return;
    this.row = { item, li: item.parentElement, id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, active: false };
  },
  rowMove(event) {
    const r = this.row;
    if (!r || event.pointerId !== r.id) return;
    const dx = event.clientX - r.x0, dy = event.clientY - r.y0;
    if (!r.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { this.row = null; return; }
      if (Math.abs(dx) < 12) return;
      r.active = true;
      try { r.item.setPointerCapture(event.pointerId); } catch (error) { /* sin captura: sigue igual */ }
      r.li.classList.add("is-swiping");
    }
    r.dx = Math.max(-150, Math.min(150, dx));
    r.item.style.transform = `translateX(${r.dx}px)`;
    r.li.dataset.dir = r.dx < 0 ? "left" : "right";
    r.li.classList.toggle("is-armed", Math.abs(r.dx) >= this.THRESHOLD);
  },
  rowUp(event) {
    const r = this.row;
    this.row = null;
    if (!r || !r.active) return;
    r.item.dataset.swiped = "1";
    setTimeout(() => delete r.item.dataset.swiped, 50);
    const done = Math.abs(r.dx) >= this.THRESHOLD;
    const action = r.item.dataset.action;
    const id = r.item.dataset.id;
    r.item.style.transition = "transform .25s ease";
    if (done && r.dx < 0) {
      r.item.style.transform = "translateX(-110%)";
      setTimeout(() => this.removeRow(action, id), 200);
      return;
    }
    r.item.style.transform = "";
    setTimeout(() => { r.item.style.transition = ""; r.li.classList.remove("is-swiping", "is-armed"); delete r.li.dataset.dir; }, 260);
    if (done && r.dx > 0) (action === "edit-income" ? Forms.income(id) : Forms.expense(id));
  },
  removeRow(action, id) {
    const isIncome = action === "edit-income";
    const list = isIncome ? Store.state.incomes : Store.state.expenses;
    const item = list.find(x => x.id === id);
    if (!item) return App.render();
    Store.commitWithUndo(`Borraste “${item.description}”.`, state => {
      if (isIncome) state.incomes = state.incomes.filter(x => x.id !== id);
      else state.expenses = state.expenses.filter(x => x.id !== id);
    });
  },

  /** Deslizar la tarjeta del balance cambia de mes. */
  monthDown(event) {
    const card = event.target.closest("[data-swipe-month]");
    if (!card || event.target.closest("button")) return;
    this.month = { id: event.pointerId, x0: event.clientX, y0: event.clientY };
  },
  monthUp(event) {
    const m = this.month;
    this.month = null;
    if (!m || event.pointerId !== m.id) return;
    const dx = event.clientX - m.x0, dy = event.clientY - m.y0;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    App.setHomeMonth(dx > 0 ? -1 : 1);
  },

  /** En el celular, la hoja de carga se cierra arrastrándola hacia abajo. */
  sheet(dialog) {
    const grab = $(".modal__grab", dialog), head = $(".modal__head", dialog);
    let s = null;
    const down = event => {
      if (!matchMedia("(max-width: 520px)").matches) return;
      s = { id: event.pointerId, y0: event.clientY, dy: 0 };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch (error) { /* nada */ }
      dialog.style.transition = "none";
    };
    const move = event => {
      if (!s || event.pointerId !== s.id) return;
      s.dy = Math.max(0, event.clientY - s.y0);
      dialog.style.transform = `translateY(${s.dy}px)`;
    };
    const up = () => {
      if (!s) return;
      const close = s.dy > 110;
      s = null;
      dialog.style.transition = "transform .22s ease";
      if (close) {
        dialog.style.transform = "translateY(100%)";
        setTimeout(() => { Modal.close("cancel"); dialog.style.transform = ""; dialog.style.transition = ""; }, 200);
      } else {
        dialog.style.transform = "";
        setTimeout(() => { dialog.style.transition = ""; }, 230);
      }
    };
    for (const el of [grab, head].filter(Boolean)) {
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    }
  },
};
