import { UIState } from "../app/state.js";
import { CONFIG, FREQUENCIES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { capitalize } from "../lib/utils.js";
import { Calendar } from "../ui/calendar.js";
import { UI } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { subHead, Views } from "./index.js";

export const PagosViews = {
  pagos() {
    const list = Finance.upcoming();
    const next30 = list.filter(p => p.days <= 30);
    const total30 = next30.reduce((t, p) => t + Money.cost(p), 0);
    return html`
      ${subHead({
        title: "Próximos pagos",
        subtitle: `${Money.format(total30)} en los próximos 30 días · ${next30.length} ${next30.length === 1 ? "pago" : "pagos"}`,
      })}
      ${Views.reminderBanner()}
      <div class="grid grid--wide">
        <section class="card">
          <header class="card__head"><h2 class="card__title">Por fecha</h2><span class="eyebrow">Destacados: menos de ${CONFIG.soonDays} días</span></header>
          ${
            list.length
              ? html`<ul class="list">${list.map(p => UI.paymentRow(p))}</ul>`
              : UI.empty({
                  iconName: "calendar",
                  title: "No hay pagos programados",
                  text: "Agregá una suscripción o un gasto mensual.",
                  action: html`<button type="button" class="btn btn--primary" data-action="new-subscription">Agregar suscripción</button>`,
                })
          }
        </section>
        <section class="card">${Views.calendar()}</section>
      </div>
      ${Views.calendarCard()}`;
  },

  /** Lista de suscripciones activas y gastos fijos con su botón para agendarlos. */
  calendarCard() {
    const st = Store.state;
    const subs = [...Finance.activeSubscriptions()].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const fixed = st.expenses.filter(e => e.recurring);
    const all = [
      ...subs.map(item => ({
        item,
        kind: "subscription",
        name: item.name,
        meta: `${FREQUENCIES[item.frequency].label} · próximo ${Dates.formatShort(item.nextDate)}`,
      })),
      ...fixed.map(item => ({
        item,
        kind: "fixed",
        name: item.description,
        meta: `Mensual · próximo ${Dates.formatShort(Finance.nextRecurringDate(item))}`,
      })),
    ];
    const pending = all.filter(x => !Calendar.isAdded(x.item)).length;
    return html`<section class="card section" id="calendario">
      <header class="card__head">
        <div><h2 class="card__title">Avisos en tu calendario</h2>
          <p class="small muted">${all.length ? (pending ? `${pending} de ${all.length} sin agendar` : "Todo agendado") : ""}</p></div>
        ${all.length > 1 ? html`<button type="button" class="btn btn--compact" data-action="calendar-ics-all">${icon("calendar", 16)}Todos a Apple Calendar</button>` : icon("bell")}
      </header>
      <p class="small muted" style="margin-bottom:16px">Agregá cada cobro a Google Calendar o a Apple Calendar y te avisa el celular aunque no abras Numo, el día anterior. Se repite solo, con la misma frecuencia de la suscripción. Si después cambiás el monto o la fecha, el botón te avisa para actualizarlo.</p>
      ${
        all.length
          ? html`<ul class="list">${all.map(
              ({ item, kind, name, meta }) => html`<li class="item item--wrap item--calendar">
            ${UI.avatar(Finance.category(item.categoryId))}
            <div class="item__body"><span class="item__title"><span>${name}</span></span><span class="item__meta">${Money.format(item.amount, item.currency)} · ${meta}</span></div>
            ${Calendar.buttons(item, kind === "subscription" ? "subscription" : "fixed")}
          </li>`,
            )}</ul>`
          : UI.empty({
              iconName: "calendar",
              title: "No hay cobros para agendar",
              text: "Cargá una suscripción o un gasto mensual.",
            })
      }
    </section>`;
  },

  calendar() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + UIState.calendarOffset, 1);
    const monthKey = Dates.iso(first).slice(0, 7);
    const leading = (first.getDay() + 6) % 7;
    const days = Dates.daysInMonth(first.getFullYear(), first.getMonth());
    const today = Dates.today();
    const occurrences = Finance.occurrencesInMonth(monthKey);
    const total = occurrences.reduce((t, o) => t + Money.cost(o), 0);

    const byDate = new Map();
    for (const o of occurrences) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);

    const cells = [];
    for (let i = 0; i < leading; i++)
      cells.push(html`<div class="calendar__day calendar__day--blank" aria-hidden="true"></div>`);
    for (let d = 1; d <= days; d++) {
      const date = `${monthKey}-${Dates.pad(d)}`;
      const items = byDate.get(date) ?? [];
      const classes = [
        "calendar__day",
        date === today && "calendar__day--today",
        date < today && "calendar__day--past",
        items.length && "calendar__day--has",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(html`<div class="${classes}"${attrs({ "aria-label": items.length ? `${d}: ${items.map(x => x.name).join(", ")}` : false })}>
        <span>${d}</span>
        ${items.length > 0 && html`<span class="calendar__dots">${items.slice(0, 4).map(x => html`<i class="calendar__dot" style="background:${Finance.category(x.categoryId).color}"></i>`)}</span>`}
      </div>`);
    }

    return html`
      <header class="card__head">
        <div><h2 class="card__title">${capitalize(Dates.monthName(monthKey))}</h2><p class="small muted">${Money.format(total)} en ${occurrences.length} ${occurrences.length === 1 ? "pago" : "pagos"}</p></div>
        <div class="btn-row">
          ${UIState.calendarOffset > 0 && html`<button type="button" class="btn btn--compact" data-action="calendar-today">Hoy</button>`}
          <button type="button" class="btn btn--icon btn--compact" data-action="calendar-prev" aria-label="Mes anterior"${attrs({ disabled: UIState.calendarOffset <= 0 })}>${icon("left", 18)}</button>
          <button type="button" class="btn btn--icon btn--compact" data-action="calendar-next" aria-label="Mes siguiente"${attrs({ disabled: UIState.calendarOffset >= 12 })}>${icon("right", 18)}</button>
        </div>
      </header>
      <div class="calendar">
        ${["lu", "ma", "mi", "ju", "vi", "sá", "do"].map(d => html`<div class="calendar__dow" aria-hidden="true">${d}</div>`)}
        ${cells}
      </div>
      <div class="section">
        ${
          occurrences.length
            ? html`<ul class="list">${occurrences.map(
                o => html`<li class="item">
              ${UI.avatar(Finance.category(o.categoryId))}
              <div class="item__body"><span class="item__title"><span>${o.name}</span></span><span class="item__meta">${Dates.formatShort(o.date)}</span></div>
              <span class="item__amount">${Money.format(o.amount, o.currency)}</span>
            </li>`,
              )}</ul>`
            : html`<p class="small muted">Sin vencimientos este mes.</p>`
        }
      </div>`;
  },
};
