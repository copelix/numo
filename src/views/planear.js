import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { numberText } from "../lib/utils.js";
import { UI } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { subHead } from "./index.js";

export const PlanearViews = {
  planear() {
    const st = Store.state;
    const spentByCat = new Map(
      Finance.totalsByCategory(Finance.expensesInMonth(Dates.monthKey(0))).map(x => [x.category.id, x.total]),
    );
    const budgetSum = Object.values(st.categoryBudgets).reduce((t, v) => t + v, 0);

    const budgetRows = st.categories.map(c => {
      const limit = st.categoryBudgets[c.id] ?? 0;
      const spent = spentByCat.get(c.id) ?? 0;
      const pct = limit ? (spent / limit) * 100 : 0;
      return html`<li class="item item--wrap">
        ${UI.avatar(c)}
        <div class="item__body" style="min-width:160px">
          <span class="item__title"><span>${c.name}</span>${limit > 0 && spent > limit && html`<span class="badge badge--soon">Excedido</span>`}</span>
          <span class="item__meta">${Money.format(spent)}${limit ? ` de ${Money.format(limit)}` : " · sin tope"}</span>
          ${limit > 0 && UI.meter(pct, `Tope de ${c.name}`)}
        </div>
        <label class="field budget-field"><span>Tope mensual</span>
          <input class="input" type="text" inputmode="decimal" autocomplete="off" id="budget-${c.id}" data-budget="${c.id}" value="${limit ? numberText(limit) : ""}" placeholder="Sin tope">
        </label>
      </li>`;
    });

    const goalRows = st.goals.map(g => {
      const pct = (g.saved / g.target) * 100;
      const left = Math.max(0, g.target - g.saved);
      const monthsLeft = g.deadline ? Math.max(1, Dates.diff(g.deadline, Dates.today()) / 30.44) : 0;
      return html`<li class="card" style="padding:16px">
        <div class="card__head" style="margin-bottom:4px">
          <h3 class="card__title">${g.name}</h3>
          ${left === 0 ? html`<span class="badge">Cumplida</span>` : g.deadline && html`<span class="badge badge--muted">${Dates.formatShort(g.deadline)}</span>`}
        </div>
        <p class="small muted">${Money.format(g.saved)} de ${Money.format(g.target)} · ${Math.round(Math.min(pct, 100))}%</p>
        ${UI.meter(pct, `Progreso de ${g.name}`)}
        <p class="small">${left === 0 ? "¡Llegaste a la meta!" : html`Faltan ${Money.format(left)}${g.deadline && html`: ahorrá <strong>${Money.format(left / monthsLeft)}</strong> por mes para llegar.`}`}</p>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn btn--compact" data-action="contribute-goal" data-id="${g.id}">Sumar ahorro</button>
          <button type="button" class="btn btn--compact btn--ghost" data-action="edit-goal" data-id="${g.id}">Editar</button>
        </div>
      </li>`;
    });

    return html`
      ${subHead({ title: "Metas y topes", subtitle: "Metas de ahorro y topes de gasto por categoría" })}
      <div class="grid grid--wide">
        <section class="card">
          <header class="card__head"><h2 class="card__title">Metas de ahorro</h2><button type="button" class="btn btn--primary btn--compact" data-action="new-goal">${icon("plus", 18)}Nueva meta</button></header>
          ${
            goalRows.length
              ? html`<ul class="list">${goalRows}</ul>`
              : UI.empty({
                  iconName: "target",
                  title: "Sin metas todavía",
                  text: "Un viaje, un fondo de emergencia, algo que quieras comprar.",
                })
          }
        </section>
        <section class="card">
          <header class="card__head"><h2 class="card__title">Topes por categoría</h2><span class="eyebrow">Este mes</span></header>
          ${st.settings.monthlyBudget > 0 && budgetSum > st.settings.monthlyBudget && html`<p class="banner small">La suma de los topes (${Money.format(budgetSum)}) supera tu presupuesto general (${Money.format(st.settings.monthlyBudget)}).</p>`}
          <ul class="list">${budgetRows}</ul>
        </section>
      </div>`;
  },
};
