import { Money } from "../core/money.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { UI } from "./components.js";
import { icon } from "./icons.js";

export const Charts = {
  donut(items, total, drill = null) {
    if (!items.length || total <= 0) {
      return UI.empty({ iconName: "pie", title: "Todavía no hay gastos este mes", text: "Cuando registres uno, vas a ver acá en qué se te va la plata." });
    }
    const size = 148, stroke = 18, r = (size - stroke) / 2, circumference = 2 * Math.PI * r;
    const gap = items.length > 1 ? 2 : 0;
    let offset = 0;
    const segments = items.map(({ category, total: value }) => {
      const length = (value / total) * circumference;
      const segment = html`<circle class="donut__seg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${category.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(length - gap, 0.5)} ${circumference}" stroke-dashoffset="${-offset}"${attrs(drill ? { "data-action": "drill-category", "data-id": category.id, "data-from": drill.from, "data-to": drill.to } : {})}></circle>`;
      offset += length;
      return segment;
    });
    const percent = value => Math.round((value / total) * 100);
    const summary = items.map(i => `${i.category.name} ${percent(i.total)}%`).join(", ");
    return html`<div class="donut-wrap">
      <svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="Gastos por categoría: ${summary}">
        <circle class="donut__track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"></circle>
        <g transform="rotate(-90 ${size / 2} ${size / 2})">${segments}</g>
        <text class="donut__label" x="50%" y="46%" text-anchor="middle">Total</text>
        <text class="donut__value" x="50%" y="60%" text-anchor="middle">${Money.compact(total)}</text>
      </svg>
      <ul class="legend">${items.map(i => drill
        ? html`<li><button type="button" class="legend__btn" data-action="drill-category" data-id="${i.category.id}" data-from="${drill.from}" data-to="${drill.to}" aria-label="Ver los gastos de ${i.category.name}">
            <span class="legend__swatch" style="background:${i.category.color}"></span>
            <span>${i.category.name}</span>
            <span class="legend__value">${Money.format(i.total)} · ${percent(i.total)}%</span>
            ${icon("right", 14)}
          </button></li>`
        : html`<li>
            <span class="legend__swatch" style="background:${i.category.color}"></span>
            <span>${i.category.name}</span>
            <span class="legend__value">${Money.format(i.total)} · ${percent(i.total)}%</span>
          </li>`)}</ul>
    </div>`;
  },

  bars(data) {
    const max = Math.max(...data.map(d => d.total), 1);
    const current = Dates.monthKey(0);
    const summary = data.map(d => `${Dates.monthName(d.key, "short")}: ${Money.format(d.total)}`).join(", ");
    return html`<div class="bars${data.length > 6 ? " bars--dense" : ""}" role="img" aria-label="Gasto por mes. ${summary}">${data.map(d => html`
      <div class="bars__col${d.key === current ? " bars__col--current" : ""}">
        <span class="bars__value">${d.total ? Money.compact(d.total) : "–"}</span>
        <span class="bars__track"><span class="bars__bar" style="height:${Math.round((d.total / max) * 150)}px"></span></span>
        <span class="bars__label">${Dates.monthName(d.key, "short")}</span>
      </div>`)}</div>`;
  },

  /** Barras de a pares por mes: ingresos (verde) y gastos (claro); arriba, el balance. */
  pairs(data) {
    const max = Math.max(...data.flatMap(d => [d.total, d.earned]), 1);
    const height = value => Math.round((value / max) * 150);
    const summary = data.map(d => `${Dates.monthName(d.key, "short")}: entraron ${Money.format(d.earned)}, salieron ${Money.format(d.total)}`).join("; ");
    return html`
      <div class="chart-legend" aria-hidden="true">
        <span><i class="legend__swatch" style="background:var(--chart-in)"></i>Ingresos</span>
        <span><i class="legend__swatch" style="background:var(--chart-out)"></i>Gastos</span>
        <span>Arriba: lo que quedó</span>
      </div>
      <div class="pairs${data.length > 6 ? " bars--dense" : ""}" role="img" aria-label="Ingresos y gastos por mes. ${summary}">${data.map(d => {
        const balance = d.earned - d.total;
        return html`<button type="button" class="pairs__col" data-action="drill-month" data-value="${d.key}" aria-label="Ver los movimientos de ${Dates.monthName(d.key)}">
          <span class="bars__value">${d.earned || d.total ? `${balance > 0 ? "+" : ""}${Money.compact(balance)}` : "–"}</span>
          <span class="pairs__track"><span class="pairs__bar pairs__bar--in" style="height:${height(d.earned)}px"></span><span class="pairs__bar pairs__bar--out" style="height:${height(d.total)}px"></span></span>
          <span class="bars__label">${Dates.monthName(d.key, "short")}</span>
        </button>`;
      })}</div>
      <p class="small muted chart-hint">Tocá un mes o una categoría para ver sus movimientos.</p>`;
  },
};
