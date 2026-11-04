import { UIState } from "../app/state.js";
import { Money } from "../core/money.js";
import { Shared } from "../core/shared.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { capitalize } from "../lib/utils.js";
import { UI } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { subHead, Views } from "./index.js";

export const CompartidosViews = {
  /* ---------- Gastos compartidos ---------- */
  compartidos() {
    const st = Store.state;
    const list = [...st.shared].sort((a, b) => Number(a.settled) - Number(b.settled) || b.date.localeCompare(a.date));
    const status = ev => {
      if (ev.settled) return html`<span class="badge badge--muted">Saldado</span>`;
      const b = Shared.myBalance(ev);
      if (Math.abs(b) < 1) return html`<span class="badge badge--muted">A mano</span>`;
      return html`<span class="badge${b < 0 ? " badge--soon" : ""}">${b > 0 ? "Te deben" : "Debés"} ${Money.format(Math.abs(b), ev.currency)}</span>`;
    };
    return html`
      ${subHead({
        title: "Gastos compartidos",
        subtitle: "Anotá quién pagó qué y Numo calcula quién le paga a quién",
        actions: html`<button type="button" class="btn btn--primary" data-action="new-shared">${icon("plus", 18)}Nuevo</button>`,
      })}
      ${list.length
        ? html`<ul class="list">${list.map(ev => html`<li><button type="button" class="item item--button${ev.settled ? " item--off" : ""}" data-action="open-shared" data-id="${ev.id}">
            <span class="avatar" aria-hidden="true">${icon("users")}</span>
            <span class="item__body">
              <span class="item__title"><span>${ev.name}</span>${status(ev)}</span>
              <span class="item__meta">${Dates.formatShort(ev.date)} · ${ev.people.length} personas · ${ev.items.length} ${ev.items.length === 1 ? "gasto" : "gastos"}</span>
            </span>
            <span class="item__end"><span class="item__amount">${Money.format(Shared.total(ev), ev.currency)}</span></span>
          </button></li>`)}</ul>`
        : html`<div class="card">${UI.empty({
            iconName: "users",
            title: "Nada compartido todavía",
            text: "El asado, el viaje, la cancha… Cargá quién pagó qué y Numo te dice quién le debe a quién, listo para mandar al grupo.",
            action: html`<button type="button" class="btn btn--primary" data-action="new-shared">Empezar una cuenta</button>`,
          })}</div>`}`;
  },

  compartido() {
    const ev = Shared.find(UIState.sharedId);
    if (!ev) return Views.compartidos();
    const f = n => Money.format(n, ev.currency);
    const total = Shared.total(ev);
    const balances = Shared.balances(ev);
    const transfers = Shared.transfers(ev);
    const all = ev.people.length;
    const mine = balances[0];
    const myExpense = ev.expenseId && Store.state.expenses.find(e => e.id === ev.expenseId);
    return html`
      ${subHead({
        title: ev.name,
        subtitle: `${capitalize(Dates.formatLong(ev.date))} · ${all} personas · total ${f(total)}`,
        actions: html`<button type="button" class="btn" data-action="edit-shared" data-id="${ev.id}">Editar</button>`,
        back: ["compartidos", "Compartidos"],
      })}
      <div class="people section" aria-label="Personas">${ev.people.map((p, i) => html`<span class="person">${p}${i === 0 && " (vos)"}</span>`)}</div>
      <div class="grid grid--wide section">
        <section class="card">
          <header class="card__head"><h2 class="card__title">Quién pagó qué</h2><button type="button" class="btn btn--primary btn--compact" data-action="add-shared-item" data-id="${ev.id}">${icon("plus", 18)}Agregar</button></header>
          ${ev.items.length
            ? html`<ul class="list">${ev.items.map(it => html`<li><button type="button" class="item item--button" data-action="edit-shared-item" data-id="${it.id}" data-event="${ev.id}">
                <span class="item__body">
                  <span class="item__title"><span>${it.description}</span></span>
                  <span class="item__meta">Pagó ${ev.people[it.paidBy]} · ${it.among.length === all ? "entre todos" : `entre ${it.among.map(i => ev.people[i]).join(", ")}`}</span>
                </span>
                <span class="item__end"><span class="item__amount">${f(it.amount)}</span><span class="small muted">${f(it.amount / it.among.length)} c/u</span></span>
              </button></li>`)}</ul>`
            : UI.empty({ iconName: "receipt", title: "Todavía no hay gastos", text: "Agregá lo que pagó cada uno: la carne, las bebidas, la nafta…" })}
        </section>
        <section class="card">
          <header class="card__head"><h2 class="card__title">Para quedar a mano</h2>${ev.settled && html`<span class="badge badge--muted">Saldado</span>`}</header>
          ${ev.items.length === 0
            ? html`<p class="small muted">Cuando cargues gastos, acá aparece quién le paga a quién.</p>`
            : transfers.length
              ? html`<ul class="list">${transfers.map(t => html`<li class="item">
                  <span class="avatar" aria-hidden="true">${icon("swap")}</span>
                  <span class="item__body"><span class="item__title"><span>${ev.people[t.from]} → ${ev.people[t.to]}</span></span>
                    <span class="item__meta">${t.from === 0 ? "Le pagás vos" : t.to === 0 ? "Te paga a vos" : "Entre ellos"}</span></span>
                  <span class="item__end"><span class="item__amount">${f(t.amount)}</span></span>
                </li>`)}</ul>`
              : html`<p>Están todos a mano.</p>`}
          <ul class="mini-list" aria-label="Cuánto puso cada uno">${balances.map((r, i) => html`<li>
            <span>${r.name}${i === 0 && " (vos)"}<small>Puso ${f(r.paid)} · le toca ${f(r.share)}</small></span>
            <span class="delta ${r.balance > 0.5 ? "delta--good" : r.balance < -0.5 ? "delta--bad" : ""}">${Math.abs(r.balance) < 0.5 ? "a mano" : `${r.balance > 0 ? "+" : "−"}${f(Math.abs(r.balance))}`}</span></li>`)}</ul>
          <div class="btn-row section">
            <button type="button" class="btn btn--primary" data-action="share-shared" data-id="${ev.id}"${attrs({ disabled: !ev.items.length })}>Mandar al grupo</button>
            ${myExpense
              ? html`<button type="button" class="btn" data-action="edit-expense" data-id="${myExpense.id}">Ver mi gasto</button>`
              : html`<button type="button" class="btn" data-action="shared-mine" data-id="${ev.id}"${attrs({ disabled: mine.share < 0.5 })}>Anotar mi parte (${f(mine.share)})</button>`}
            <button type="button" class="btn btn--ghost" data-action="toggle-shared-settled" data-id="${ev.id}">${ev.settled ? "Reabrir" : "Marcar saldado"}</button>
          </div>
        </section>
      </div>`;
  },
};
