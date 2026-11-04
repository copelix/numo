import { UIState } from "../app/state.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { $ } from "../lib/utils.js";
import { UI } from "../ui/components.js";
import { categoryOptions, Field } from "../ui/fields.js";
import { Gestures } from "../ui/gestures.js";
import { icon } from "../ui/icons.js";

export const MovimientosViews = {
  /* ---------- Movimientos: gastos e ingresos juntos ---------- */
  movimientos() {
    const f = UIState.filters;
    const type = UIState.movementType;
    const hasFilters = Boolean(f.categoryId || f.from || f.to);
    const monthKey = Dates.monthKey(0);
    const add =
      type === "gastos"
        ? html`<button type="button" class="btn btn--primary" data-action="new-expense">${icon("plus", 18)}Nuevo gasto</button>`
        : type === "ingresos"
          ? html`<button type="button" class="btn btn--primary" data-action="new-income">${icon("plus", 18)}Nuevo ingreso</button>`
          : html`<button type="button" class="btn btn--primary" data-action="new-entry">${icon("plus", 18)}Agregar</button>`;

    return html`
      ${UI.pageHead({
        title: "Movimientos",
        subtitle: `Este mes entraron ${Money.format(Finance.earnedInMonth(monthKey))} y salieron ${Money.format(Finance.spentInMonth(monthKey))}`,
        actions: add,
      })}
      <div class="toolbar">
        ${UI.segmented({
          key: "movementType",
          value: type,
          label: "Mostrar",
          options: [
            ["todo", "Todo"],
            ["gastos", "Gastos"],
            ["ingresos", "Ingresos"],
          ],
        })}
        <div class="toolbar__search">
          <label class="sr-only" for="filter-q">Buscar movimientos</label>
          <input class="input" type="search" id="filter-q" name="q" data-filter="q" value="${f.q}" placeholder="Buscar…" autocomplete="off">
        </div>
      </div>
      <details class="card filters"${attrs({ open: hasFilters })}>
        <summary>Filtros${hasFilters ? " · activos" : ""}</summary>
        <form class="form-grid" role="search" data-form="filters">
          ${type !== "ingresos" && Field.select({ label: "Categoría (gastos)", name: "categoryId", value: f.categoryId, id: "filter-category", "data-filter": "categoryId", options: [["", "Todas"], ...categoryOptions()] })}
          ${Field.input({ label: "Desde", name: "from", type: "date", value: f.from, id: "filter-from", "data-filter": "from" })}
          ${Field.input({ label: "Hasta", name: "to", type: "date", value: f.to, id: "filter-to", "data-filter": "to" })}
          <div class="btn-row field--full">
            <button type="button" class="btn btn--compact" data-action="filter-range" data-value="this">Este mes</button>
            <button type="button" class="btn btn--compact" data-action="filter-range" data-value="last">Mes pasado</button>
            ${hasFilters && html`<button type="button" class="btn btn--compact btn--ghost" data-action="clear-filters">Limpiar filtros</button>`}
          </div>
        </form>
      </details>
      <div id="expense-results"></div>`;
  },

  /** Dibuja solo la lista, así el buscador no pierde el foco mientras escribís. */
  renderExpenseResults() {
    const target = $("#expense-results");
    if (!target) return;
    const st = Store.state;
    const { q, categoryId, from, to } = UIState.filters;
    const type = UIState.movementType;
    const query = q.trim().toLowerCase();
    const inRange = date => (!from || date >= from) && (!to || date <= to);

    const expenses =
      type === "ingresos"
        ? []
        : st.expenses
            .filter(e => (!categoryId || e.categoryId === categoryId) && inRange(e.date))
            .filter(
              e =>
                !query ||
                `${e.description} ${e.paymentMethod} ${Finance.category(e.categoryId).name}`
                  .toLowerCase()
                  .includes(query),
            );
    const incomes =
      type === "gastos" || categoryId
        ? []
        : st.incomes
            .filter(i => inRange(i.date))
            .filter(
              i => !query || `${i.description} ${Finance.incomeSource(i.sourceId).name}`.toLowerCase().includes(query),
            );
    const results = [
      ...expenses.map(item => ({ kind: "expense", item, date: item.date, name: item.description })),
      ...incomes.map(item => ({ kind: "income", item, date: item.date, name: item.description })),
    ].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

    if (!results.length) {
      const anything = st.expenses.length + st.incomes.length > 0;
      target.innerHTML = String(
        html`<div class="card">${UI.empty({
          iconName: anything ? "search" : "receipt",
          title: anything ? "No hay movimientos con esos filtros" : "Todavía no cargaste movimientos",
          text: anything ? "" : "Cargá lo que gastás y lo que cobrás para ver cuánto te queda.",
          action:
            !anything &&
            html`<button type="button" class="btn btn--primary" data-action="new-entry">Agregar el primero</button>`,
        })}</div>`,
      );
      return;
    }

    const visible = results.slice(0, UIState.expenseLimit);
    const groups = new Map();
    for (const r of visible) groups.set(r.date, [...(groups.get(r.date) ?? []), r]);
    const totalIn = Finance.sum(incomes),
      totalOut = Finance.sum(expenses);
    const summary = [
      `${results.length} ${results.length === 1 ? "movimiento" : "movimientos"}`,
      incomes.length > 0 && `entraron ${Money.format(totalIn)}`,
      expenses.length > 0 && `salieron ${Money.format(totalOut)}`,
    ]
      .filter(Boolean)
      .join(" · ");

    target.innerHTML = String(html`
      <p class="small muted" aria-live="polite" style="margin:0 4px 8px">${summary}</p>
      ${Gestures.isTouch && html`<p class="swipe-hint">${icon("left", 14)} Deslizá para borrar · deslizá para editar ${icon("right", 14)}</p>`}
      ${[...groups.entries()].map(([date, items]) => {
        const net =
          Finance.sum(items.filter(x => x.kind === "income").map(x => x.item)) -
          Finance.sum(items.filter(x => x.kind === "expense").map(x => x.item));
        return html`
          <div class="group-head"><span>${Dates.formatShort(date)}</span><span>${net > 0 ? "+" : ""}${Money.format(net)}</span></div>
          <ul class="list list--swipe">${items.map(x => (x.kind === "income" ? UI.incomeRow(x.item) : UI.expenseRow(x.item)))}</ul>`;
      })}
      ${results.length > visible.length && html`<div class="section" style="text-align:center"><button type="button" class="btn" data-action="show-more-expenses">Ver ${Math.min(60, results.length - visible.length)} más</button></div>`}`);
  },
};
