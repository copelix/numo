import { UIState } from "../app/state.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { attrs, html, trusted } from "../lib/html.js";
import { capitalize } from "../lib/utils.js";
import { UI } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { MonthChart } from "../ui/month-chart.js";
import { Views } from "./index.js";

export const InicioViews = {
  /* ---------- Inicio: cuánto me queda y qué tengo que pagar ---------- */
  inicio() {
    const st = Store.state;
    const offset = UIState.homeOffset;
    const isCurrent = offset === 0;
    const monthKey = Dates.monthKey(offset);
    const monthLabel = Dates.monthName(monthKey).split(" ")[0];
    const spent = Finance.spentInMonth(monthKey);
    const earned = Finance.earnedInMonth(monthKey);
    const balance = earned - spent;
    const prevKey = Dates.monthKey(offset - 1);
    const prevEarned = Finance.earnedInMonth(prevKey);
    const prevBalance = prevEarned - Finance.spentInMonth(prevKey);
    const budget = isCurrent ? st.settings.monthlyBudget : 0;
    const used = budget ? (spent / budget) * 100 : 0;
    const week = Finance.upcoming().filter(p => p.days <= 7);
    const weekTotal = week.reduce((t, p) => t + Money.cost(p), 0);

    return html`
      ${UI.pageHead({ title: "Inicio", subtitle: capitalize(Dates.monthName(monthKey)) })}
      ${Views.saveBanner()}
      ${Views.demoBanner()}

      <section class="card balance" aria-label="Balance del mes" data-swipe-month>
        <div class="balance__nav">
          <button type="button" class="btn btn--icon btn--compact btn--ghost" data-action="home-month" data-value="-1" aria-label="Mes anterior"${attrs({ disabled: offset <= -11 })}>${icon("left", 18)}</button>
          <p class="eyebrow" aria-live="polite">${isCurrent ? "Te queda este mes" : `Te quedó en ${monthLabel}`}</p>
          <button type="button" class="btn btn--icon btn--compact btn--ghost" data-action="home-month" data-value="1" aria-label="Mes siguiente"${attrs({ disabled: isCurrent })}>${icon("right", 18)}</button>
        </div>
        <p class="balance__value" ${trusted(earned ? `data-count="${balance}"` : "")}>${earned ? Money.format(balance) : "—"}</p>
        <div class="balance__row">
          <div><span class="small muted">Ingresos del mes</span><strong class="item__amount--in">${Money.format(earned)}</strong></div>
          <div><span class="small muted">Gastos del mes</span><strong>${Money.format(spent)}</strong></div>
        </div>
        <p class="small muted" style="margin-top:12px">${
          !earned
            ? isCurrent
              ? html`<button type="button" class="link-btn" data-action="new-income">Cargá tus ingresos del mes</button> para ver cuánto te queda.`
              : "No cargaste ingresos en ese mes."
            : balance >= 0
              ? `Te queda el ${Math.round((balance / earned) * 100)}% de lo que entró.`
              : `Gastaste ${Money.format(-balance)} más de lo que entró.`
        }
          ${prevEarned > 0 && ` ${isCurrent ? "El mes pasado" : `En ${Dates.monthName(prevKey).split(" ")[0]}`} ${prevBalance >= 0 ? `te quedaron ${Money.format(prevBalance)}` : `gastaste ${Money.format(-prevBalance)} de más`}.`}</p>
        ${!isCurrent && html`<p class="small" style="margin-top:12px"><button type="button" class="link-btn" data-action="home-month" data-value="today">Volver a este mes</button></p>`}
        ${
          budget > 0 &&
          html`<div class="balance__budget">
          <div class="balance__budget-head"><span class="small muted">Presupuesto: ${Money.format(spent)} de ${Money.format(budget)}</span><span class="small">${Math.round(used)}%</span></div>
          ${UI.meter(used, "Presupuesto usado")}
          ${spent > budget && html`<p class="small">Te pasaste por ${Money.format(spent - budget)}.</p>`}
        </div>`
        }
      </section>

      ${Views.monthChartCard()}

      ${isCurrent && Views.hero()}

      <section class="card">
        <header class="card__head">
          <div><h2 class="card__title">Esta semana</h2>${week.length > 0 && html`<p class="small muted">${Money.format(weekTotal)} en ${week.length} ${week.length === 1 ? "pago" : "pagos"}</p>`}</div>
          <a class="link small" href="#/pagos">Ver todos</a>
        </header>
        ${
          week.length
            ? html`<ul class="list">${week.map(p => UI.paymentRow(p))}</ul>`
            : UI.empty({ iconName: "calendar", title: "Nada para pagar en los próximos 7 días" })
        }
      </section>`;
  },

  monthChartCard() {
    const d = MonthChart.data();
    const cur = d.current.at(-1) ?? 0;
    const prev = d.previous[Math.min(d.today, d.previous.length) - 1] ?? 0;
    const diff = cur - prev;
    const month = d.monthName.split(" ")[0],
      prevMonth = d.prevName.split(" ")[0];
    const note =
      !cur && !prev
        ? "Todavía no hay gastos para comparar."
        : !d.isCurrent
          ? `Gastaste ${Money.format(cur)} en ${month}${prev ? `: ${diff > 0 ? `${Money.format(diff)} más` : diff < 0 ? `${Money.format(-diff)} menos` : "lo mismo"} que en ${prevMonth}` : ""}.`
          : prev
            ? `A esta altura del mes pasado llevabas ${Money.format(prev)}: ${diff > 0 ? `vas ${Money.format(diff)} arriba` : diff < 0 ? `vas ${Money.format(-diff)} abajo` : "vas igual"}.`
            : `Llevás ${Money.format(cur)} gastados este mes.`;
    return html`<section class="card section mchart-card" aria-labelledby="mchart-title">
      <header class="card__head">
        <div><h2 class="card__title" id="mchart-title">${d.isCurrent ? "Así viene el mes" : `Así fue ${month}`}</h2><p class="small muted">${note}</p></div>
      </header>
      <div class="mchart__legend" aria-hidden="true">
        <span><i class="mchart__key mchart__key--cur"></i>${d.isCurrent ? "Este mes" : capitalize(month)}</span>
        <span><i class="mchart__key mchart__key--prev"></i>${d.isCurrent ? "Mes pasado" : capitalize(prevMonth)}</span>
        ${d.budget > 0 && html`<span><i class="mchart__key mchart__key--budget"></i>Presupuesto</span>`}
      </div>
      <div class="mchart" id="month-chart" role="img"></div>
    </section>`;
  },
};
