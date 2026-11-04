import { CONFIG } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { isHexColor } from "../lib/utils.js";
import { icon } from "./icons.js";

export const UI = {
  pageHead({ title, subtitle, actions }) {
    return html`<header class="page-head">
      <div><h1 class="page-title">${title}</h1>${subtitle && html`<p class="page-sub">${subtitle}</p>`}</div>
      ${actions && html`<div class="btn-row">${actions}</div>`}
    </header>`;
  },

  avatar(category) {
    const color = isHexColor(category.color) ? category.color : "#9c9c9d";
    return html`<span class="avatar" style="background:${color}1f;box-shadow:inset 0 0 0 1px ${color}40" aria-hidden="true">${category.icon}</span>`;
  },

  meter(percent, label) {
    const p = Math.max(0, percent);
    const modifier = p >= 100 ? " meter--over" : p >= 80 ? " meter--warn" : "";
    return html`<div class="meter${modifier}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(p, 100))}" aria-valuetext="${Math.round(p)}%"><span style="width:${Math.min(p, 100)}%"></span></div>`;
  },

  empty({ iconName = "sparkle", title, text, action }) {
    return html`<div class="empty">${icon(iconName, 28)}<p class="empty__title">${title}</p>${text && html`<p class="small">${text}</p>`}${action}</div>`;
  },

  segmented({ key, value, options, label }) {
    return html`<div class="segmented" role="group" aria-label="${label}">${options.map(([v, text]) =>
      html`<button type="button" data-action="segment" data-key="${key}" data-value="${v}" aria-pressed="${String(String(v) === String(value))}">${text}</button>`)}</div>`;
  },

  paymentRow(p, { withAction = false } = {}) {
    const soon = p.days < CONFIG.soonDays;
    return html`<li class="item${soon ? " item--soon" : ""}${withAction && p.kind === "subscription" ? " item--action" : ""}">
      ${UI.avatar(Finance.category(p.categoryId))}
      <div class="item__body">
        <span class="item__title"><span>${p.name}</span>${p.kind === "recurring" && html`<span class="badge badge--muted">Fijo</span>`}${p.kind === "installment" && html`<span class="badge badge--muted">Cuota</span>`}</span>
        <span class="item__meta">${Dates.formatShort(p.date)} · ${p.paymentMethod || "Sin método"}</span>
      </div>
      <div class="item__end">
        <span class="item__amount">${Money.format(p.amount, p.currency)}</span>
        ${p.currency !== Money.base && html`<span class="small muted">${Money.format(Money.cost(p))}${p.cardTax && p.currency !== "ARS" ? " c/imp." : ""}</span>`}
        <span class="badge${soon ? " badge--soon" : ""}">${Dates.relative(p.days)}</span>
      </div>
      ${withAction && p.kind === "subscription" && html`<button type="button" class="btn btn--compact" data-action="mark-paid" data-id="${p.id}" aria-label="Marcar ${p.name} como pagada">Pagué</button>`}
    </li>`;
  },

  expenseRow(e) {
    const badge = e.subscriptionId ? "Suscripción" : e.installmentId ? `Cuota ${e.installmentN}/${e.installmentCount}` : e.recurring ? "Mensual" : e.templateId ? "Automático" : "";
    return html`<li><button type="button" class="item item--button" data-action="edit-expense" data-id="${e.id}">
      ${UI.avatar(Finance.category(e.categoryId))}
      <span class="item__body">
        <span class="item__title"><span>${e.description}</span>${badge && html`<span class="badge badge--muted">${badge}</span>`}</span>
        <span class="item__meta">${Finance.category(e.categoryId).name} · ${e.paymentMethod || "Sin método"}</span>
      </span>
      <span class="item__end">
        <span class="item__amount">${Money.format(e.amount, e.currency)}</span>
        ${(e.currency !== Money.base || e.cardTax) && html`<span class="small muted">${Money.format(Money.cost(e))}${e.cardTax && e.currency !== "ARS" ? " c/imp." : ""}</span>`}
      </span>
    </button></li>`;
  },
};
Object.assign(UI, {
  incomeRow(i) {
    const source = Finance.incomeSource(i.sourceId);
    const badge = i.recurring ? "Fijo" : i.templateId ? "Automático" : "";
    return html`<li><button type="button" class="item item--button" data-action="edit-income" data-id="${i.id}">
      ${UI.avatar(source)}
      <span class="item__body">
        <span class="item__title"><span>${i.description}</span>${badge && html`<span class="badge badge--muted">${badge}</span>`}</span>
        <span class="item__meta">${source.name}</span>
      </span>
      <span class="item__end">
        <span class="item__amount item__amount--in">+${Money.format(i.amount, i.currency)}</span>
        ${i.currency !== Money.base && html`<span class="small muted">${Money.format(Money.convert(i.amount, i.currency))}</span>`}
      </span>
    </button></li>`;
  },
});
