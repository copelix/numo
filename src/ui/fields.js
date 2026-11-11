import { CURRENCIES, PAYMENT_METHODS } from "../config.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { attrs, html } from "../lib/html.js";
import { $, numberText } from "../lib/utils.js";

/* =========================================================================
   10. COMPONENTES DE INTERFAZ
   ========================================================================= */
export const Field = {
  wrap(label, control, { full, hint } = {}) {
    return html`<label class="field${full ? " field--full" : ""}"><span>${label}</span>${control}${hint && html`<span class="field__hint">${hint}</span>`}</label>`;
  },
  input({ label, name, value = "", type = "text", full, hint, ...rest }) {
    return this.wrap(label, html`<input class="input" name="${name}" type="${type}" value="${value}"${attrs(rest)}>`, {
      full,
      hint,
    });
  },
  number({ value = "", min = "0", ...options }) {
    return this.input({
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      "data-number": true,
      "data-min": min,
      value: numberText(value),
      ...options,
    });
  },
  select({ label, name, value, options, full, hint, ...rest }) {
    const opts = options.map(
      ([v, text]) => html`<option value="${v}"${attrs({ selected: String(v) === String(value) })}>${text}</option>`,
    );
    return this.wrap(label, html`<select class="input" name="${name}"${attrs(rest)}>${opts}</select>`, { full, hint });
  },
  textarea({ label, name, value = "", full = true, ...rest }) {
    return this.wrap(label, html`<textarea class="input" name="${name}"${attrs(rest)}>${value}</textarea>`, { full });
  },
  /** Opciones para tocar (radios con ícono): categorías o tipos de ingreso. */
  chips({ label, name, value, options }) {
    const labelId = `lbl-${name}`;
    return html`<div class="field field--full"><span id="${labelId}">${label}</span>
      <div class="chips" role="radiogroup" aria-labelledby="${labelId}">${options.map(
        ([v, glyph, text]) => html`<label class="chip-opt">
        <input type="radio" name="${name}" value="${v}"${attrs({ checked: String(v) === String(value) })}>
        <span class="chip-opt__icon" aria-hidden="true">${glyph}</span><span class="chip-opt__text">${text}</span>
      </label>`,
      )}</div></div>`;
  },
  /** "Lo pago con tarjeta en pesos": solo se ve si la moneda no es pesos. */
  cardTax(checked, currency) {
    return html`<label class="check field--full" data-cardtax${attrs({ hidden: currency === "ARS" })}><input type="checkbox" name="cardTax"${attrs({ checked })}><span>Lo pago con tarjeta en pesos (suma ${Money.cardTax()}% de impuestos)</span></label>`;
  },
  /** Método de pago: una lista con los habituales y los que ya usaste. */
  paymentMethod({ value = "", full } = {}) {
    const used = [...Store.state.subscriptions, ...Store.state.expenses, ...Store.state.installments]
      .map(x => x.paymentMethod)
      .filter(Boolean);
    const all = [...new Set([...PAYMENT_METHODS, ...used, ...(value ? [value] : [])])];
    return this.select({
      label: "Método de pago",
      name: "paymentMethod",
      value,
      options: [["", "Sin especificar"], ...all.map(m => [m, m])],
      full,
    });
  },
  /** Muestra u oculta el campo anterior cuando cambia la moneda, y lo marca solo si elegís pagar con tarjeta. */
  wireCardTax(form) {
    const currency = $('select[name="currency"]', form);
    const field = $("[data-cardtax]", form);
    if (!currency || !field) return;
    const sync = () => {
      field.hidden = currency.value === "ARS";
    };
    currency.addEventListener("change", sync);
    $('select[name="paymentMethod"]', form)?.addEventListener("change", e => {
      $("input", field).checked = /tarjeta/i.test(e.target.value);
    });
    form.addEventListener("click", () => setTimeout(sync, 0)); // los "recientes" cambian la moneda sin evento
  },
  checkbox({ label, name, checked, full = true, ...rest }) {
    return html`<label class="check${full ? " field--full" : ""}"><input type="checkbox" name="${name}"${attrs({ checked, ...rest })}><span>${label}</span></label>`;
  },
};
export const currencyOptions = () => CURRENCIES.map(c => [c, c]);
export const categoryOptions = () => Store.state.categories.map(c => [c.id, `${c.icon} ${c.name}`]);
