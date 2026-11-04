import { CONFIG, FREQUENCIES, STATUSES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { Calendar } from "../ui/calendar.js";
import { UI } from "../ui/components.js";
import { icon } from "../ui/icons.js";

export const SuscripcionesViews = {
  /* ---------- Suscripciones: ordenadas por próximo cobro ---------- */
  suscripciones() {
    const st = Store.state;
    const today = Dates.today();
    const active = [...Finance.activeSubscriptions()].sort(
      (a, b) => a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name),
    );
    const inactive = st.subscriptions.filter(s => s.status !== "activa").sort((a, b) => a.name.localeCompare(b.name));
    const paused = inactive.filter(s => s.status === "pausada").length;
    const monthly = Finance.subscriptionsMonthlyTotal();

    const row = s => {
      const isActive = s.status === "activa";
      const days = Dates.diff(s.nextDate, today);
      const soon = isActive && days < CONFIG.soonDays;
      const change = Finance.latestPriceChange(s);
      const tags = [change && change.to > change.from && "Aumentó", s.usage === "bajo" && "Poco uso"].filter(Boolean);
      const extra =
        s.frequency !== "mensual" || s.currency !== Money.base
          ? ` · ${Money.format(Finance.monthlyCost(s))}/mes${s.cardTax && s.currency !== "ARS" ? " con impuestos" : ""}`
          : "";
      return html`<li><button type="button" class="item item--button${soon ? " item--soon" : ""}${isActive ? "" : " item--off"}" data-action="edit-subscription" data-id="${s.id}">
        ${UI.avatar(Finance.category(s.categoryId))}
        <span class="item__body">
          <span class="item__title"><span>${s.name}</span>
            ${tags.map(t => html`<span class="badge badge--soon">${t}</span>`)}
            ${!isActive && html`<span class="badge badge--muted">${STATUSES[s.status]}</span>`}
          </span>
          <span class="item__meta">${FREQUENCIES[s.frequency].label}${isActive ? ` · ${Dates.formatShort(s.nextDate)}` : ""}${extra}</span>
        </span>
        <span class="item__end">
          <span class="item__amount">${Money.format(s.amount, s.currency)}</span>
          ${isActive && html`<span class="badge${soon ? " badge--soon" : ""}">${Dates.relative(days)}</span>`}
        </span>
      </button></li>`;
    };

    return html`
      ${UI.pageHead({
        title: "Suscripciones",
        subtitle: `${Money.format(monthly)} por mes · ${Money.format(monthly * 12)} por año`,
        actions: html`<button type="button" class="btn btn--primary" data-action="new-subscription">${icon("plus", 18)}Nueva</button>`,
      })}
      ${
        active.some(s => !Calendar.isAdded(s)) &&
        html`<a class="banner banner--info banner--link" href="#/pagos" data-scroll="calendario">${icon("bell")}<div>
        <strong>Recibí avisos en el celular</strong>
        <p class="small muted">Agregá tus cobros a Google Calendar en un toque.</p>
      </div>${icon("right", 18)}</a>`
      }
      ${
        active.length
          ? html`<ul class="list">${active.map(row)}</ul>`
          : html`<div class="card">${UI.empty({
              iconName: "repeat",
              title: "No tenés suscripciones activas",
              text: "Netflix, Spotify, el gimnasio, el hosting… Cargalas y vas a ver cuándo te cobran cada una.",
              action: html`<button type="button" class="btn btn--primary" data-action="new-subscription">Agregar la primera</button>`,
            })}</div>`
      }
      ${
        inactive.length > 0 &&
        html`<details class="section inactive">
        <summary>Pausadas y canceladas (${inactive.length})</summary>
        <ul class="list">${inactive.map(row)}</ul>
        ${paused > 0 && html`<p class="small muted" style="margin-top:8px">Si una pausada ya no la vas a usar, cancelala desde "Editar".</p>`}
      </details>`
      }`;
  },
};
