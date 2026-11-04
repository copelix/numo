import { UIState } from "../app/state.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { $, capitalize, clamp } from "../lib/utils.js";

/* ---------- Gráfico "Así viene el mes": gasto acumulado día a día ---------- */
export const MonthChart = {
  /** Gasto acumulado por día de un mes: [día 1, día 2, …]. */
  cumulative(monthKey, days, untilDay = days) {
    const perDay = new Array(days).fill(0);
    for (const e of Finance.expensesInMonth(monthKey)) {
      const d = Dates.dayOf(e.date);
      if (d >= 1 && d <= days) perDay[d - 1] += Money.cost(e);
    }
    let total = 0;
    return perDay.slice(0, untilDay).map(v => (total += v));
  },

  data(offset = UIState.homeOffset) {
    const key = Dates.monthKey(offset),
      prevKey = Dates.monthKey(offset - 1);
    const first = Dates.parse(`${key}-01`);
    const days = Dates.daysInMonth(first.getFullYear(), first.getMonth());
    const prevFirst = Dates.parse(`${prevKey}-01`);
    const prevDays = Dates.daysInMonth(prevFirst.getFullYear(), prevFirst.getMonth());
    const today = offset === 0 ? Dates.dayOf(Dates.today()) : days;
    return {
      days,
      today,
      isCurrent: offset === 0,
      current: this.cumulative(key, days, today),
      previous: this.cumulative(prevKey, prevDays).slice(0, days),
      budget: offset === 0 ? Store.state.settings.monthlyBudget || 0 : 0,
      monthName: Dates.monthName(key),
      prevName: Dates.monthName(prevKey),
    };
  },

  /** Escala "linda" para el eje: 0, paso, 2·paso… */
  niceMax(value) {
    if (value <= 0) return 1;
    const step = 10 ** Math.floor(Math.log10(value));
    const n = value / step;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * step;
  },

  render() {
    const box = $("#month-chart");
    if (!box) return;
    const d = this.data();
    const width = Math.max(260, box.clientWidth),
      height = 220;
    const pad = { top: 18, right: 14, bottom: 26, left: 50 };
    const plotW = width - pad.left - pad.right,
      plotH = height - pad.top - pad.bottom;
    const yMax = this.niceMax(Math.max(d.current.at(-1) ?? 0, d.previous.at(-1) ?? 0, d.budget) * 1.05);
    const x = day => pad.left + ((day - 1) / Math.max(1, d.days - 1)) * plotW;
    const y = v => pad.top + plotH - (v / yMax) * plotH;
    const path = arr => arr.map((v, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const ticks = [0, yMax / 2, yMax];
    const xTicks = [1, 10, 20, d.days];
    const lastCur = d.current.at(-1) ?? 0;
    const lastPrevAtToday = d.previous[Math.min(d.today, d.previous.length) - 1] ?? 0;
    const area = d.current.length
      ? `${path(d.current)}L${x(d.current.length).toFixed(1)},${y(0)}L${x(1)},${y(0)}Z`
      : "";
    const budgetY = d.budget ? y(d.budget) : null;

    const summary = `Gasto acumulado de ${d.monthName}: ${Money.format(lastCur)} al día ${d.today}. ${d.prevName}, al mismo día: ${Money.format(lastPrevAtToday)}.${d.budget ? ` Presupuesto: ${Money.format(d.budget)}.` : ""}`;
    box.setAttribute("aria-label", summary);
    box.innerHTML = String(html`
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="mchart__svg" aria-hidden="true">
        ${ticks.map(
          t => html`<line class="mchart__grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"></line>
          <text class="mchart__tick" x="${pad.left - 8}" y="${y(t) + 4}" text-anchor="end">${t ? Money.compact(t) : "0"}</text>`,
        )}
        ${xTicks.map(t => html`<text class="mchart__tick" x="${x(t)}" y="${height - 6}" text-anchor="middle">${t}</text>`)}
        ${
          budgetY !== null &&
          html`<line class="mchart__budget" x1="${pad.left}" x2="${width - pad.right}" y1="${budgetY}" y2="${budgetY}"></line>
          <text class="mchart__note" x="${width - pad.right}" y="${budgetY - 6}" text-anchor="end">Presupuesto</text>`
        }
        ${d.previous.length > 1 && html`<path class="mchart__prev" d="${path(d.previous)}"></path>`}
        ${area && html`<path class="mchart__area" d="${area}"></path>`}
        ${d.current.length > 1 && html`<path class="mchart__line" pathLength="1" d="${path(d.current)}"></path>`}
        ${d.current.length > 0 && html`<circle class="mchart__dot" cx="${x(d.current.length)}" cy="${y(lastCur)}" r="5"></circle>`}
        <line class="mchart__cursor" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + plotH}" display="none"></line>
        <circle class="mchart__cursor-dot" cx="-50" cy="-50" r="4" display="none"></circle>
        <rect class="mchart__hit" x="${pad.left}" y="0" width="${plotW}" height="${height}"></rect>
      </svg>
      <div class="mchart__tip" hidden></div>`);

    // Detalle al pasar el dedo o el mouse
    const svg = $("svg", box),
      tip = $(".mchart__tip", box);
    const cursor = $(".mchart__cursor", svg),
      cursorDot = $(".mchart__cursor-dot", svg);
    const show = event => {
      const rect = svg.getBoundingClientRect();
      const day = clamp(Math.round(((event.clientX - rect.left - pad.left) / plotW) * (d.days - 1)) + 1, 1, d.days);
      const cur = d.current[day - 1],
        prev = d.previous[day - 1];
      cursor.setAttribute("x1", x(day));
      cursor.setAttribute("x2", x(day));
      cursor.setAttribute("display", "inline");
      if (cur !== undefined) {
        cursorDot.setAttribute("cx", x(day));
        cursorDot.setAttribute("cy", y(cur));
        cursorDot.setAttribute("display", "inline");
      } else cursorDot.setAttribute("display", "none");
      tip.innerHTML = String(html`<strong>Día ${day}</strong>
        <span><i class="mchart__key mchart__key--cur"></i>${capitalize(d.monthName.split(" ")[0])}: ${cur === undefined ? "todavía no llegó" : Money.format(cur)}</span>
        ${prev !== undefined && html`<span><i class="mchart__key mchart__key--prev"></i>${capitalize(d.prevName.split(" ")[0])}: ${Money.format(prev)}</span>`}`);
      tip.hidden = false;
      const tipW = tip.offsetWidth;
      tip.style.left = `${clamp(x(day) - tipW / 2, 0, width - tipW)}px`;
    };
    const hide = () => {
      tip.hidden = true;
      cursor.setAttribute("display", "none");
      cursorDot.setAttribute("display", "none");
    };
    const hit = $(".mchart__hit", svg);
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hide);
  },
};
