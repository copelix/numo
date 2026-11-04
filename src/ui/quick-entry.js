import { Money } from "../core/money.js";
import { html } from "../lib/html.js";
import { $, $$, numberText, toNumber } from "../lib/utils.js";

/* ---------- Carga rápida: montos rápidos, recientes y categoría automática ---------- */
export const QuickEntry = {
  steps(currency) {
    if (["ARS", "CLP", "UYU"].includes(currency)) return [1000, 5000, 10000];
    if (["BRL", "MXN"].includes(currency)) return [10, 50, 100];
    return [5, 10, 20];
  },
  amountsHTML(currency) {
    return html`${this.steps(currency).map(v => html`<button type="button" class="quick__btn" data-add="${v}">+${new Intl.NumberFormat("es-AR").format(v)}</button>`)}
      <button type="button" class="quick__btn quick__btn--clear" data-add="clear" aria-label="Borrar el monto">Borrar</button>`;
  },
  /** Los últimos movimientos distintos, para repetirlos en un toque. */
  recents(list, limit = 5) {
    const seen = new Set(), out = [];
    for (const x of [...list].sort((a, b) => b.date.localeCompare(a.date))) {
      if (x.subscriptionId || x.templateId) continue;
      const key = x.description.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key); out.push(x);
      if (out.length >= limit) break;
    }
    return out;
  },
  recentsHTML(items) {
    if (!items.length) return "";
    return html`<div class="field field--full"><span>Repetir uno reciente</span>
      <div class="recents">${items.map(x => html`<button type="button" class="recent" data-recent="${x.id}">
        <span>${x.description}</span><span class="recent__amount">${Money.format(x.amount, x.currency)}</span></button>`)}</div></div>`;
  },
  descriptionsDatalist(list) {
    const names = [...new Set(list.map(x => x.description))].slice(0, 80);
    return html`<datalist id="desc-suggest">${names.map(n => html`<option value="${n}"></option>`)}</datalist>`;
  },
  /** Conecta los botones del formulario. kind: "expense" | "income". */
  wire(form, kind, list) {
    const amount = $('input[name="amount"]', form);
    const currency = $('select[name="currency"]', form);
    const quick = $("[data-quick]", form);
    const pickRadio = (name, value) => { const r = $(`input[name="${name}"][value="${CSS.escape(value)}"]`, form); if (r) r.checked = true; };
    let manualCategory = false;
    form.addEventListener("change", e => { if (e.target.name === "categoryId" || e.target.name === "sourceId") manualCategory = true; });
    quick?.addEventListener("click", e => {
      const b = e.target.closest("[data-add]");
      if (!b) return;
      if (b.dataset.add === "clear") amount.value = "";
      else amount.value = numberText(Math.round((toNumber(amount.value) + Number(b.dataset.add)) * 100) / 100);
      amount.setCustomValidity("");
      amount.focus({ preventScroll: true });
    });
    currency?.addEventListener("change", () => { if (quick) quick.innerHTML = String(this.amountsHTML(currency.value)); });
    $(".recents", form)?.addEventListener("click", e => {
      const b = e.target.closest("[data-recent]");
      const x = b && list.find(i => i.id === b.dataset.recent);
      if (!x) return;
      amount.value = numberText(x.amount);
      currency.value = x.currency;
      if (quick) quick.innerHTML = String(this.amountsHTML(x.currency));
      $('input[name="description"]', form).value = x.description;
      if (kind === "expense") {
        pickRadio("categoryId", x.categoryId);
        const pm = $('input[name="paymentMethod"]', form);
        if (pm && x.paymentMethod) pm.value = x.paymentMethod;
      } else pickRadio("sourceId", x.sourceId);
      $$(".recent", form).forEach(r => r.classList.toggle("is-picked", r === b));
      amount.focus({ preventScroll: true });
      amount.select?.();
    });
    // Escribís "Supermercado" y la categoría se elige sola (según cómo lo cargaste antes)
    $('input[name="description"]', form)?.addEventListener("change", e => {
      if (manualCategory) return;
      const text = e.target.value.trim().toLowerCase();
      const match = [...list].sort((a, b) => b.date.localeCompare(a.date)).find(x => x.description.trim().toLowerCase() === text);
      if (!match) return;
      if (kind === "expense") {
        pickRadio("categoryId", match.categoryId);
        const pm = $('input[name="paymentMethod"]', form);
        if (pm && !pm.value && match.paymentMethod) pm.value = match.paymentMethod;
      } else pickRadio("sourceId", match.sourceId);
    });
  },
};
