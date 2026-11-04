import { CURRENCIES, ROUTES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Inflation } from "../core/inflation.js";
import { Money } from "../core/money.js";
import { Shared } from "../core/shared.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { Sync } from "../sync/sync.js";
import { UI } from "../ui/components.js";
import { currencyOptions, Field } from "../ui/fields.js";
import { icon } from "../ui/icons.js";
import { Theme } from "../ui/theme.js";
import { subHead, Views } from "./index.js";

export const MasViews = {
  /* ---------- Más: menú con todo lo demás ---------- */
  mas() {
    const st = Store.state;
    const route = id => ROUTES.find(r => r.id === id);
    const next30 = Finance.upcoming().filter(p => p.days <= 30).length;
    const activeCuotas = Finance.activeInstallments();
    const cuotasText = activeCuotas.length
      ? `${activeCuotas.length} ${activeCuotas.length === 1 ? "compra" : "compras"} en curso · ${Money.format(Finance.installmentsInMonth(Dates.monthKey(0)))} este mes`
      : "Compras en cuotas que se registran solas cada mes";
    const openShared = st.shared.filter(x => !x.settled);
    const owed = openShared.reduce((t, x) => t + Money.convert(Shared.myBalance(x), x.currency), 0);
    const sharedText = openShared.length
      ? `${openShared.length} ${openShared.length === 1 ? "cuenta abierta" : "cuentas abiertas"}${Math.abs(owed) >= 1 ? ` · ${owed > 0 ? "te deben" : "debés"} ${Money.format(Math.abs(owed))}` : " · a mano"}`
      : "Asados, viajes y salidas: quién le debe a quién";
    const lastIpc = Inflation.lastKnown();
    const inflationText = `${Inflation.pct(Inflation.rate(lastIpc))} en ${Dates.monthName(lastIpc)} · tus gastos en pesos de hoy`;
    const entry = (id, description, badge) => {
      const r = route(id);
      return html`<li><a class="item item--button item--link" href="#/${id}">
        <span class="avatar" aria-hidden="true">${icon(r.icon)}</span>
        <span class="item__body">
          <span class="item__title"><span>${r.title}</span>${badge && html`<span class="badge badge--soon">${badge}</span>`}</span>
          <span class="item__meta">${description}</span>
        </span>
        ${icon("right", 18)}
      </a></li>`;
    };
    const group = (title, items) =>
      html`<div class="menu-group"><div class="group-head"><span>${title}</span></div><ul class="list">${items}</ul></div>`;

    return html`
      ${UI.pageHead({ title: "Más" })}
      ${group("Tu cuenta", [entry("cuenta", Sync.statusLabel(), Sync.mode === "local" ? "Sin sincronizar" : "")])}
      ${group("Herramientas", [
        entry(
          "pagos",
          `${next30 ? `${next30} ${next30 === 1 ? "pago" : "pagos"} en los próximos 30 días` : "Calendario de vencimientos"} · avisos en Google Calendar`,
        ),
        entry(
          "planear",
          `${st.goals.length} ${st.goals.length === 1 ? "meta de ahorro" : "metas de ahorro"} · topes por categoría`,
        ),
        entry("cuotas", cuotasText),
        entry("compartidos", sharedText),
        entry("inflacion", inflationText, Inflation.missing().length ? "Falta un dato" : ""),
      ])}
      ${group("Configuración", [
        entry(
          "ajustes",
          `Tema ${Theme.OPTIONS.find(([v]) => v === st.settings.theme)[1].toLowerCase()} · moneda ${st.settings.baseCurrency} · presupuesto ${st.settings.monthlyBudget ? Money.format(st.settings.monthlyBudget) : "sin definir"} · avisos`,
        ),
        entry("categorias", `${st.categories.length} categorías con su color e ícono`),
        entry("cambio", `Dólar tarjeta (+${Money.cardTax()}%) y otras monedas`),
      ])}
      ${group("Tus datos", [entry("datos", "Exportar a Excel, importar, borrar los ejemplos")])}`;
  },

  /* ---------- Páginas dentro de "Más" ---------- */
  cuenta() {
    return html`
      ${subHead({ title: "Tu cuenta" })}
      <div class="grid grid--wide">
        ${Views.accountCard()}
        <section class="card">
          <header class="card__head"><h2 class="card__title">Usarla en el celular</h2></header>
          <p class="small muted">Abrí el link en Safari (iPhone) o Chrome (Android) y usá "Agregar a inicio" para tenerla con su ícono.${typeof window.claude?.use === "function" ? " También la encontrás en la app de Claude, en tus artifacts." : ""}</p>
          <p class="small muted" style="margin-top:8px">En la compu, la tecla <span class="badge">N</span> abre un gasto nuevo.</p>
        </section>
      </div>`;
  },

  ajustes() {
    const s = Store.state.settings;
    return html`
      ${subHead({ title: "Ajustes generales" })}
      <section class="card narrow">
        <div class="form-grid">
          ${Field.select({ label: "Moneda base", name: "baseCurrency", value: s.baseCurrency, options: currencyOptions(), id: "set-base", "data-setting": "baseCurrency" })}
          ${Field.number({ label: `Presupuesto mensual (${s.baseCurrency})`, name: "monthlyBudget", value: s.monthlyBudget || "", id: "set-budget", "data-setting": "monthlyBudget", placeholder: "Sin presupuesto" })}
          ${Field.select({
            label: "Avisarme de los pagos",
            name: "remindDays",
            value: s.remindDays,
            id: "set-remind",
            "data-setting": "remindDays",
            options: [
              [1, "1 día antes"],
              [3, "3 días antes"],
              [7, "7 días antes"],
            ],
            full: true,
          })}
          ${Field.select({ label: "Tema", name: "theme", value: s.theme, options: Theme.OPTIONS, id: "set-theme", "data-setting": "theme", full: true })}
          ${Field.checkbox({ label: "Registrar automáticamente los cobros de suscripciones como gastos", name: "autoLogSubscriptions", checked: s.autoLogSubscriptions, id: "set-autolog", "data-setting": "autoLogSubscriptions" })}
        </div>
      </section>`;
  },

  categorias() {
    const st = Store.state;
    return html`
      ${subHead({ title: "Categorías", actions: html`<button type="button" class="btn btn--primary" data-action="new-category">${icon("plus", 18)}Nueva</button>` })}
      <ul class="list narrow">${st.categories.map(
        c => html`<li><button type="button" class="item item--button" data-action="edit-category" data-id="${c.id}">
        ${UI.avatar(c)}<span class="item__body"><span class="item__title"><span>${c.name}</span></span></span>
        <span class="legend__swatch" style="background:${c.color}"></span>
      </button></li>`,
      )}</ul>`;
  },

  cambio() {
    const s = Store.state.settings;
    return html`
      ${subHead({ title: "Tipos de cambio", subtitle: "Cuántas unidades de cada moneda equivalen a 1 dólar" })}
      <section class="card narrow">
        <header class="card__head"><h2 class="card__title">Dólar tarjeta</h2>${s.baseCurrency === "ARS" && html`<span class="badge">${Money.format(s.rates.ARS * (1 + s.cardTax / 100))}</span>`}</header>
        <p class="small muted" style="margin-bottom:12px">Cuando pagás en pesos algo en dólares con tarjeta (Spotify, iCloud, compras afuera), te cobran una percepción de Ganancias. Numo la suma en las suscripciones y gastos que tengan tildado "Lo pago con tarjeta en pesos". Si pagás el resumen con tus dólares, no se cobra: destildalo.</p>
        <div class="form-grid">
          ${Field.number({ label: "Impuestos de la tarjeta (%)", name: "cardTax", value: s.cardTax, id: "set-cardtax", "data-setting": "cardTax", hint: "Hoy es 30% (percepción de Ganancias, RG 5617)." })}
          <p class="small muted" style="align-self:center">Oficial ${Money.format(s.rates.ARS, "ARS")} + ${s.cardTax}% = <strong>${Money.format(s.rates.ARS * (1 + s.cardTax / 100), "ARS")}</strong> por dólar.</p>
        </div>
      </section>
      <section class="card narrow section">
        <p class="small muted" style="margin-bottom:16px">Se usan para pasar todo a tu moneda base (${s.baseCurrency}). Actualizalos cuando quieras.</p>
        <div class="form-grid">
          ${CURRENCIES.filter(c => c !== "USD").map(c => Field.number({ label: `1 USD en ${c}`, name: `rate-${c}`, value: s.rates[c], id: `rate-${c}`, "data-rate": c, min: "0.0001" }))}
        </div>
      </section>`;
  },

  datos() {
    return html`
      ${subHead({ title: "Tus datos" })}
      <div class="grid grid--wide">
        <section class="card">
          <header class="card__head"><h2 class="card__title">Exportar e importar</h2></header>
          <div class="btn-row">
            <button type="button" class="btn" data-action="export-csv">Exportar a Excel (CSV)</button>
            <button type="button" class="btn" data-action="export-json">Copia completa (JSON)</button>
            <button type="button" class="btn" data-action="import">Importar</button>
          </div>
          <p class="small muted section">El CSV usa punto y coma, así Excel lo abre bien en español. La copia JSON sirve para restaurar todo.</p>
        </section>
        <section class="card">
          <header class="card__head"><h2 class="card__title">Borrar</h2></header>
          <div class="btn-row">
            ${
              Store.hasDemoData()
                ? html`<button type="button" class="btn btn--danger" data-action="clear-demo">Borrar datos de ejemplo</button>`
                : html`<button type="button" class="btn" data-action="load-demo">Cargar datos de ejemplo</button>`
            }
            <button type="button" class="btn btn--danger" data-action="reset-all">Borrar todo</button>
          </div>
        </section>
      </div>`;
  },
};
