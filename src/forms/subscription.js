import { FREQUENCIES, STATUSES, USAGE } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { nextOnOrAfter } from "../core/schema.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { toNumber, uid } from "../lib/utils.js";
import { Calendar } from "../ui/calendar.js";
import { categoryOptions, currencyOptions, Field } from "../ui/fields.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

export const SubscriptionForms = {
  subscription(id) {
    const st = Store.state;
    const existing = id ? st.subscriptions.find(s => s.id === id) : null;
    if (id && !existing) return;
    const s = existing ?? {
      name: "",
      amount: "",
      currency: st.settings.baseCurrency,
      frequency: "mensual",
      nextDate: Dates.today(),
      categoryId: Finance.defaultCategoryId(),
      paymentMethod: "",
      notes: "",
      status: "activa",
      usage: "",
    };
    const change = existing && Finance.latestPriceChange(existing);

    Modal.open({
      title: existing ? "Editar suscripción" : "Nueva suscripción",
      description: change
        ? `Último cambio de precio: de ${Money.format(change.from, s.currency)} a ${Money.format(change.to, s.currency)}.`
        : "",
      body: html`<div class="form-grid">
        ${Field.input({ label: "Nombre", name: "name", value: s.name, required: true, maxlength: 80, placeholder: "Netflix, gimnasio, hosting…", autocomplete: "off", full: true })}
        ${Field.number({ label: "Monto", name: "amount", value: s.amount, required: true, min: "0.01" })}
        ${Field.select({ label: "Moneda", name: "currency", value: s.currency, options: currencyOptions() })}
        ${Field.select({ label: "Frecuencia", name: "frequency", value: s.frequency, options: Object.entries(FREQUENCIES).map(([k, f]) => [k, f.label]) })}
        ${Field.input({ label: "Próximo pago", name: "nextDate", type: "date", value: s.nextDate, required: true })}
        ${Field.select({ label: "Categoría", name: "categoryId", value: s.categoryId, options: categoryOptions() })}
        ${Field.select({ label: "Estado", name: "status", value: s.status, options: Object.entries(STATUSES) })}
        ${Field.cardTax(existing ? Boolean(s.cardTax) : true, s.currency)}
        <details class="field--full more"${attrs({ open: Boolean(existing && (s.paymentMethod || s.notes || s.usage)) })}>
          <summary>Más opciones</summary>
          <div class="form-grid">
            ${Field.paymentMethod({ value: s.paymentMethod })}
            ${Field.select({ label: "¿Cuánto la usás?", name: "usage", value: s.usage, options: Object.entries(USAGE) })}
            ${Field.textarea({ label: "Notas", name: "notes", value: s.notes, maxlength: 300, rows: 2 })}
          </div>
        </details>
        ${
          existing &&
          existing.status === "activa" &&
          html`<div class="field--full more">
          <p class="small muted" style="margin:8px 0">Recibí un aviso en el celular antes de cada cobro.</p>
          ${Calendar.button(existing, "subscription")}
        </div>`
        }
      </div>`,
      onReady: form => Field.wireCardTax(form),
      onDelete:
        existing &&
        (() =>
          Store.commitWithUndo(`Eliminaste “${existing.name}”.`, state => {
            state.subscriptions = state.subscriptions.filter(x => x.id !== id);
          })),
      onSubmit: data => {
        const amount = toNumber(data.amount);
        const anchorDay = Dates.dayOf(data.nextDate);
        // Si la fecha ya pasó, se lleva al próximo cobro sin registrar gastos viejos.
        const nextDate = nextOnOrAfter(data.nextDate, data.frequency, anchorDay);
        const values = {
          name: data.name.trim(),
          amount,
          currency: data.currency,
          frequency: data.frequency,
          nextDate,
          anchorDay,
          categoryId: data.categoryId,
          paymentMethod: data.paymentMethod.trim(),
          notes: data.notes.trim(),
          status: data.status,
          usage: data.usage,
          cardTax: data.cardTax === "on" && data.currency !== "ARS",
        };
        Store.commit(state => {
          if (existing) {
            const target = state.subscriptions.find(x => x.id === id);
            if (target.amount !== amount || target.currency !== data.currency)
              target.priceHistory.push({ date: Dates.today(), amount });
            Object.assign(target, values);
            if (!values.cardTax) delete target.cardTax;
            delete target.demo;
          } else {
            if (!values.cardTax) delete values.cardTax;
            state.subscriptions.push({ id: uid(), ...values, priceHistory: [{ date: Dates.today(), amount }] });
          }
        });
        Toast.show(
          nextDate !== data.nextDate
            ? `Esa fecha ya pasó: el próximo cobro queda para el ${Dates.formatShort(nextDate)}.`
            : existing
              ? "Cambios guardados."
              : "Suscripción agregada.",
        );
      },
    });
  },
};
