import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { Charts } from "../ui/charts.js";
import { UI } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { subHead } from "./index.js";

export const CuotasViews = {
  /* ---------- Cuotas ---------- */
  cuotas() {
    const st = Store.state;
    const active = Finance.activeInstallments().sort((a, b) =>
      Finance.installmentDate(a, a.done).localeCompare(Finance.installmentDate(b, b.done)),
    );
    const finished = st.installments.filter(p => p.done >= p.count);
    const thisMonth = Finance.installmentsInMonth(Dates.monthKey(0));
    const left = active.reduce((t, p) => t + Finance.installmentLeft(p), 0);
    const next = Array.from({ length: 6 }, (_, i) => ({
      key: Dates.monthKey(i),
      total: Finance.installmentsInMonth(Dates.monthKey(i)),
    }));
    const lastMonth = p => Dates.monthName(Finance.installmentDate(p, p.count - 1).slice(0, 7));
    const row =
      p => html`<li><button type="button" class="item item--button" data-action="edit-installment" data-id="${p.id}">
      ${UI.avatar(Finance.category(p.categoryId))}
      <span class="item__body">
        <span class="item__title"><span>${p.description}</span><span class="badge badge--muted">${p.done}/${p.count}</span></span>
        <span class="item__meta">${Money.format(p.amount, p.currency)} por mes${p.cardTax && p.currency !== "ARS" ? " + impuestos" : ""} · ${p.done >= p.count ? `terminó en ${lastMonth(p)}` : `termina en ${lastMonth(p)}`}</span>
        ${UI.meter((p.done / p.count) * 100, `Cuotas pagadas de ${p.description}`)}
      </span>
      <span class="item__end">
        <span class="item__amount">${p.done >= p.count ? "Pagada" : Money.format(Finance.installmentLeft(p))}</span>
        ${p.done < p.count && html`<span class="small muted">faltan ${p.count - p.done}</span>`}
      </span>
    </button></li>`;
    return html`
      ${subHead({
        title: "Cuotas",
        subtitle: "Cada cuota se registra sola en tus gastos el mes que te la cobran",
        actions: html`<button type="button" class="btn btn--primary" data-action="new-installment">${icon("plus", 18)}Nueva compra</button>`,
      })}
      <div class="grid grid--stats">
        <article class="card"><p class="eyebrow">Este mes en cuotas</p><p class="stat__value" data-count="${thisMonth}">${Money.format(thisMonth)}</p><p class="stat__note">${active.length} ${active.length === 1 ? "compra en curso" : "compras en curso"}</p></article>
        <article class="card"><p class="eyebrow">Te falta pagar</p><p class="stat__value" data-count="${left}">${Money.format(left)}</p><p class="stat__note">${active.length ? `La última cuota es en ${lastMonth(active.reduce((a, b) => (Finance.installmentDate(a, a.count - 1) > Finance.installmentDate(b, b.count - 1) ? a : b)))}` : "Sin cuotas pendientes"}</p></article>
      </div>
      ${active.length > 0 && html`<section class="card section"><header class="card__head"><h2 class="card__title">Cuotas de los próximos meses</h2></header>${Charts.bars(next)}</section>`}
      <section class="section">
        ${
          active.length
            ? html`<ul class="list">${active.map(row)}</ul>`
            : html`<div class="card">${UI.empty({
                iconName: "card",
                title: "No tenés compras en cuotas",
                text: "Cuando cargues un gasto, elegí la cantidad de cuotas. Numo registra cada cuota sola, mes a mes, y te avisa antes.",
                action: html`<button type="button" class="btn btn--primary" data-action="new-installment">Cargar una compra</button>`,
              })}</div>`
        }
        ${finished.length > 0 && html`<details class="section inactive"><summary>Terminadas (${finished.length})</summary><ul class="list">${finished.map(row)}</ul></details>`}
      </section>`;
  },
};
