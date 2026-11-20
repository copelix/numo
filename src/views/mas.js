import { CURRENCIES, DOLAR_SOURCES, ROUTES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Inflation } from "../core/inflation.js";
import { Money } from "../core/money.js";
import { Shared } from "../core/shared.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { Backup } from "../sync/backup.js";
import { Sync } from "../sync/sync.js";
import { UI } from "../ui/components.js";
import { currencyOptions, Field } from "../ui/fields.js";
import { icon } from "../ui/icons.js";
import { Theme } from "../ui/theme.js";
import { subHead, Views } from "./index.js";

/** Nombre corto de la cotización elegida: "oficial", "MEP", "blue" o "manual". */
function dolarLabel() {
  return { oficial: "oficial", bolsa: "MEP", blue: "blue", manual: "manual" }[Store.state.settings.dolar.source];
}
/** "4 de nov., 08:55" a partir de la fecha que manda DolarAPI. */
function quoteDate(iso) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

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
          `${next30 ? `${next30} ${next30 === 1 ? "pago" : "pagos"} en los próximos 30 días` : "Calendario de vencimientos"} · avisos en tu calendario`,
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
        entry("cambio", `Dólar ${dolarLabel()}, dólar tarjeta (+${Money.cardTax()}%) y otras monedas`),
      ])}
      ${group("Tus datos", [entry("datos", "Exportar a Excel, copia de seguridad, importar")])}`;
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
    const auto = s.dolar.source !== "manual";
    const oficial = Money.rate("ARS", { card: true });
    return html`
      ${subHead({ title: "Tipos de cambio", subtitle: "Cuántas unidades de cada moneda equivalen a 1 dólar" })}
      <section class="card narrow">
        <header class="card__head"><h2 class="card__title">Dólar</h2>${auto && html`<span class="badge">${Money.format(s.rates.ARS, "ARS")}</span>`}</header>
        <div class="form-grid">
          ${Field.select({
            label: "Cotización que usa Numo",
            name: "dolarSource",
            value: s.dolar.source,
            options: DOLAR_SOURCES,
            id: "set-dolar",
            "data-setting": "dolarSource",
            full: true,
            hint: "Oficial: el del banco. MEP: el que comprás legal desde una cuenta de inversión. Blue: el informal.",
          })}
        </div>
        <p class="small muted" style="margin-top:12px" data-dolar-status>${
          auto
            ? s.dolar.quoteAt
              ? `Precio de venta, actualizado ${quoteDate(s.dolar.quoteAt)}. Se actualiza solo cada vez que abrís Numo. Fuente: DolarAPI.`
              : "Todavía no pudimos traer la cotización: se actualiza sola cuando haya conexión."
            : 'Lo cargás vos abajo, en "1 USD en ARS".'
        }</p>
      </section>
      <section class="card narrow section">
        <header class="card__head"><h2 class="card__title">Dólar tarjeta</h2>${s.baseCurrency === "ARS" && html`<span class="badge">${Money.format(Money.cardRate(), "ARS")}</span>`}</header>
        <p class="small muted" style="margin-bottom:12px">Cuando pagás en pesos algo en dólares con tarjeta (Spotify, iCloud, compras afuera), te cobran una percepción de Ganancias. Numo la suma en las suscripciones y gastos que tengan tildado "Lo pago con tarjeta en pesos". Si pagás el resumen con tus dólares, no se cobra: destildalo.</p>
        <div class="form-grid">
          ${Field.number({ label: "Impuestos de la tarjeta (%)", name: "cardTax", value: s.cardTax, id: "set-cardtax", "data-setting": "cardTax", hint: "Hoy es 30% (percepción de Ganancias, RG 5617)." })}
          <p class="small muted" style="align-self:center">Oficial ${Money.format(oficial, "ARS")} + ${s.cardTax}% = <strong>${Money.format(Money.cardRate(), "ARS")}</strong> por dólar.${auto && s.dolar.source !== "oficial" ? " Con tarjeta siempre se usa el oficial." : ""}</p>
        </div>
      </section>
      <section class="card narrow section">
        <p class="small muted" style="margin-bottom:16px">Se usan para pasar todo a tu moneda base (${s.baseCurrency}).${auto ? " El peso se actualiza solo; las demás monedas, cuando quieras." : " Actualizalos cuando quieras."}</p>
        <div class="form-grid">
          ${CURRENCIES.filter(c => c !== "USD").map(c => Field.number({ label: `1 USD en ${c}`, name: `rate-${c}`, value: s.rates[c], id: `rate-${c}`, "data-rate": c, min: "0.0001", disabled: auto && c === "ARS", hint: auto && c === "ARS" ? "Automático" : undefined }))}
        </div>
      </section>`;
  },

  datos() {
    const st = Store.state;
    const movements = st.expenses.length + st.incomes.length;
    const last = Backup.last();
    const days = last ? Math.floor((Date.now() - last) / 86400000) : -1;
    const row = ({ action, iconName, title, text, badge, danger }) =>
      html`<li><button type="button" class="item item--button item--link${danger ? " item--danger" : ""}" data-action="${action}">
        <span class="avatar" aria-hidden="true">${icon(iconName)}</span>
        <span class="item__body">
          <span class="item__title"><span>${title}</span>${badge && html`<span class="badge badge--muted">${badge}</span>`}</span>
          <span class="item__meta item__meta--wrap">${text}</span>
        </span>
        ${icon("right", 18)}
      </button></li>`;
    const group = (title, items) =>
      html`<div class="menu-group"><div class="group-head"><span>${title}</span></div><ul class="list">${items}</ul></div>`;
    return html`
      ${subHead({ title: "Tus datos" })}
      ${group("Exportar", [
        row({
          action: "export-sheet",
          iconName: "sheet",
          title: "Planilla de Excel",
          text: "Gastos, ingresos, suscripciones y cuotas, con un resumen por mes. Elegís el período.",
          badge: movements ? `${movements.toLocaleString("es-AR")} movimientos` : "",
        }),
        row({
          action: "export-backup",
          iconName: "shield",
          title: "Copia de seguridad",
          text: `Todo lo de Numo en un archivo, para recuperarlo si cambiás de teléfono. ${days < 0 ? "Todavía no hiciste ninguna." : days === 0 ? "Última: hoy." : `Última: hace ${days} ${days === 1 ? "día" : "días"}.`}`,
        }),
      ])}
      ${group("Importar", [
        row({
          action: "import",
          iconName: "upload",
          title: "Traer datos",
          text: "Desde tu planilla de Excel o CSV, o una copia de seguridad de Numo. Ves el resumen antes de confirmar.",
        }),
      ])}
      ${group("Borrar", [
        Store.hasDemoData()
          ? row({
              action: "clear-demo",
              iconName: "trash",
              title: "Borrar los datos de ejemplo",
              text: "Quedan solo los tuyos.",
            })
          : row({
              action: "load-demo",
              iconName: "sparkle",
              title: "Cargar datos de ejemplo",
              text: "Para ver cómo funciona todo. Después los borrás en un toque.",
            }),
        row({
          action: "reset-all",
          iconName: "trash",
          title: "Borrar todo",
          text: "Elimina todos tus datos de Numo. No se puede deshacer.",
          danger: true,
        }),
      ])}`;
  },
};
