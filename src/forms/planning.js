import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { isHexColor, toNumber, uid } from "../lib/utils.js";
import { Field } from "../ui/fields.js";
import { icon } from "../ui/icons.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

export const PlanningForms = {
  goal(id) {
    const existing = id ? Store.state.goals.find(g => g.id === id) : null;
    if (id && !existing) return;
    const g = existing ?? { name: "", target: "", saved: "", deadline: "" };
    Modal.open({
      title: existing ? "Editar meta" : "Nueva meta de ahorro",
      body: html`<div class="form-grid">
        ${Field.input({ label: "Nombre", name: "name", value: g.name, required: true, maxlength: 60, placeholder: "Viaje, fondo de emergencia…", full: true })}
        ${Field.number({ label: `Objetivo (${Money.base})`, name: "target", value: g.target, required: true, min: "1" })}
        ${Field.number({ label: "Ahorrado hasta ahora", name: "saved", value: g.saved })}
        ${Field.input({ label: "Fecha límite (opcional)", name: "deadline", type: "date", value: g.deadline, full: true, min: Dates.today() })}
      </div>`,
      onDelete: existing && (() => Store.commitWithUndo(`Eliminaste la meta “${existing.name}”.`, state => {
        state.goals = state.goals.filter(x => x.id !== id);
      })),
      onSubmit: data => {
        const values = { name: data.name.trim(), target: toNumber(data.target), saved: Math.max(0, toNumber(data.saved)), deadline: data.deadline };
        Store.commit(state => {
          if (existing) { Object.assign(state.goals.find(x => x.id === id), values); delete state.goals.find(x => x.id === id).demo; }
          else state.goals.push({ id: uid(), ...values });
        });
      },
    });
  },

  contribution(id) {
    const goal = Store.state.goals.find(g => g.id === id);
    if (!goal) return;
    Modal.open({
      title: `Sumar a “${goal.name}”`,
      description: `Llevás ${Money.format(goal.saved)} de ${Money.format(goal.target)}.`,
      submitLabel: "Sumar",
      body: html`<div class="form-grid">${Field.number({ label: `Monto (${Money.base})`, name: "amount", required: true, min: "0.01", full: true })}</div>`,
      onSubmit: data => {
        const amount = toNumber(data.amount);
        Store.commit(state => { state.goals.find(g => g.id === id).saved += amount; });
        const updated = Store.state.goals.find(g => g.id === id);
        Toast.show(updated.saved >= updated.target ? `¡Llegaste a la meta “${updated.name}”!` : `Sumaste ${Money.format(amount)}.`);
      },
    });
  },

  category(id) {
    const st = Store.state;
    const existing = id ? st.categories.find(c => c.id === id) : null;
    if (id && !existing) return;
    const c = existing ?? { name: "", icon: "🏷️", color: "#63a1ff" };
    const canDelete = existing && st.categories.length > 1;
    Modal.open({
      title: existing ? "Editar categoría" : "Nueva categoría",
      body: html`<div class="form-grid">
        ${Field.input({ label: "Nombre", name: "name", value: c.name, required: true, maxlength: 40, full: true })}
        ${Field.input({ label: "Ícono (un emoji)", name: "icon", value: c.icon, required: true, maxlength: 8 })}
        ${Field.input({ label: "Color", name: "color", type: "color", value: c.color })}
      </div>`,
      onDelete: canDelete && (() => {
        const fallback = st.categories.find(x => x.id !== id && x.id === "otros") ?? st.categories.find(x => x.id !== id);
        Store.commitWithUndo(`Eliminaste “${existing.name}”. Sus movimientos pasaron a ${fallback.name}.`, state => {
          state.categories = state.categories.filter(x => x.id !== id);
          for (const item of [...state.subscriptions, ...state.expenses]) if (item.categoryId === id) item.categoryId = fallback.id;
          delete state.categoryBudgets[id];
        });
      }),
      onSubmit: data => {
        const values = { name: data.name.trim(), icon: data.icon.trim() || "🏷️", color: isHexColor(data.color) ? data.color : "#9c9c9d" };
        Store.commit(state => {
          if (existing) Object.assign(state.categories.find(x => x.id === id), values);
          else state.categories.push({ id: uid(), ...values });
        });
      },
    });
  },
};
