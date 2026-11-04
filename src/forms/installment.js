import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Schema } from "../core/schema.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { $, toNumber, uid } from "../lib/utils.js";
import { categoryOptions, currencyOptions, Field, paymentDatalist } from "../ui/fields.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

export const InstallmentForms = {
  /** Compra en cuotas (crear o editar). Los cambios valen para las cuotas que faltan. */
  installment(id) {
    const st = Store.state;
    const existing = id ? st.installments.find(p => p.id === id) : null;
    if (id && !existing) return;
    const p = existing ?? {
      description: "", amount: "", count: 12, currency: st.settings.baseCurrency, firstDate: Dates.today(),
      categoryId: Finance.defaultCategoryId(), paymentMethod: "Tarjeta de crédito", done: 0,
    };
    const started = existing && existing.done > 0;
    Modal.open({
      title: existing ? "Editar compra en cuotas" : "Nueva compra en cuotas",
      description: started ? `Ya se registraron ${existing.done} de ${existing.count} cuotas. Los cambios valen para las que faltan.` : "Cada cuota se carga sola en tus gastos el mes que corresponde.",
      body: html`<div class="form-grid">
        ${Field.input({ label: "Qué compraste", name: "description", value: p.description, required: true, maxlength: 80, placeholder: "Heladera, celular, pasajes…", autocomplete: "off", full: true })}
        ${Field.number({ label: "Monto de cada cuota", name: "amount", value: p.amount, required: true, min: "0.01" })}
        ${Field.select({ label: "Moneda", name: "currency", value: p.currency, options: currencyOptions() })}
        ${Field.input({ label: "Cantidad de cuotas", name: "count", type: "number", value: p.count, required: true, min: Math.max(2, existing?.done ?? 0), max: 120, step: 1, inputmode: "numeric" })}
        ${Field.input({ label: "Primera cuota", name: "firstDate", type: "date", value: p.firstDate, required: true, disabled: Boolean(started) })}
        <p class="hint-line field--full" data-plan-hint aria-live="polite"></p>
        ${Field.select({ label: "Categoría", name: "categoryId", value: p.categoryId, options: categoryOptions() })}
        ${Field.input({ label: "Método de pago", name: "paymentMethod", value: p.paymentMethod, list: "payment-methods", autocomplete: "off" })}
        ${Field.cardTax(existing ? Boolean(p.cardTax) : true, p.currency)}
      </div>${paymentDatalist()}`,
      focus: existing ? null : 'input[name="description"]',
      onReady: form => {
        Field.wireCardTax(form);
        const hint = $("[data-plan-hint]", form);
        const update = () => {
          const amount = toNumber($('input[name="amount"]', form).value);
          const count = Math.round(toNumber($('input[name="count"]', form).value));
          const currency = $('select[name="currency"]', form).value;
          const first = $('input[name="firstDate"]', form).value;
          hint.textContent = amount && count >= 2 && Dates.isValid(first)
            ? `Total ${Money.format(amount * count, currency)}. Última cuota en ${Dates.monthName(Dates.addMonths(first, count - 1, Dates.dayOf(first)).slice(0, 7))}.`
            : "";
        };
        form.addEventListener("input", update);
        update();
      },
      deleteLabel: "Eliminar compra",
      onDelete: existing && (() => Store.commitWithUndo(`Eliminaste la compra “${existing.description}”. Las cuotas ya registradas quedan en tus gastos.`, state => {
        state.installments = state.installments.filter(x => x.id !== id);
      })),
      onSubmit: (data, form) => {
        const count = Math.round(toNumber(data.count));
        if (count < 2 || count > 120 || (existing && count < existing.done)) {
          const input = $('input[name="count"]', form);
          input.setCustomValidity(existing && count < existing.done ? `Ya se pagaron ${existing.done} cuotas.` : "Poné entre 2 y 120 cuotas.");
          input.reportValidity();
          return false;
        }
        const values = {
          description: data.description.trim(), amount: toNumber(data.amount), count, currency: data.currency,
          categoryId: data.categoryId, paymentMethod: data.paymentMethod.trim(),
          cardTax: data.cardTax === "on" && data.currency !== "ARS",
        };
        Store.commit(state => {
          if (existing) {
            const target = state.installments.find(x => x.id === id);
            Object.assign(target, values);
            if (!started && Dates.isValid(data.firstDate)) target.firstDate = data.firstDate;
            if (!values.cardTax) delete target.cardTax;
            delete target.demo;
          } else {
            state.installments.push(Schema.installment({ id: uid(), ...values, firstDate: data.firstDate, done: 0 },
              { ids: new Set(state.categories.map(c => c.id)), fallback: Finance.defaultCategoryId() }));
          }
          Finance.settle();
        });
        Toast.show(existing ? "Cambios guardados." : `Listo: ${count} cuotas de ${Money.format(values.amount, values.currency)}.`);
      },
    });
  },
};
