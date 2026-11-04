import { Router } from "../app/router.js";
import { INCOME_SOURCES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Schema } from "../core/schema.js";
import { Store } from "../core/store.js";
import { Forms } from "./index.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { $, toNumber, uid } from "../lib/utils.js";
import { currencyOptions, Field, paymentDatalist } from "../ui/fields.js";
import { Modal } from "../ui/modal.js";
import { QuickEntry } from "../ui/quick-entry.js";
import { Toast } from "../ui/toast.js";

export const MovementsForms = {
  /** El "+" general: pregunta si es un gasto o un ingreso. */
  async entry() {
    const choice = await Modal.choose({
      title: "¿Qué querés cargar?",
      message: "Elegí si es plata que salió o que entró.",
      options: [{ value: "income", label: "Ingreso" }, { value: "expense", label: "Gasto", variant: "primary" }],
    });
    if (choice === "expense") Forms.expense();
    else if (choice === "income") Forms.income();
  },

  expense(id) {
    const st = Store.state;
    const existing = id ? st.expenses.find(e => e.id === id) : null;
    if (id && !existing) return;
    const e = existing ?? {
      description: "", amount: "", currency: st.settings.baseCurrency, date: Dates.today(),
      categoryId: Finance.defaultCategoryId(), paymentMethod: "", recurring: false,
    };
    const plan = existing?.installmentId && st.installments.find(p => p.id === existing.installmentId);
    const origin = existing?.subscriptionId ? "Lo registró la app cuando se cobró la suscripción."
      : existing?.installmentId ? `Es la cuota ${existing.installmentN} de ${existing.installmentCount}${plan ? ` de “${plan.description}”. Para cambiar la compra, andá a Más → Cuotas` : ""}.`
      : existing?.templateId ? "Lo generó la app a partir de un gasto mensual." : "";
    const cuotaOptions = [[1, "Un pago"], ...[2, 3, 4, 5, 6, 9, 10, 12, 18, 24].map(n => [n, `${n} cuotas`])];

    Modal.open({
      title: existing ? "Editar gasto" : "Nuevo gasto",
      description: origin,
      body: html`<div class="form-grid">
        ${!existing && QuickEntry.recentsHTML(QuickEntry.recents(st.expenses))}
        ${Field.number({ label: "Monto", name: "amount", value: e.amount, required: true, min: "0.01" })}
        ${Field.select({ label: "Moneda", name: "currency", value: e.currency, options: currencyOptions() })}
        <div class="quick field--full" data-quick>${QuickEntry.amountsHTML(e.currency)}</div>
        ${Field.input({ label: "Descripción", name: "description", value: e.description, required: true, maxlength: 80, placeholder: "Supermercado, nafta, regalo…", autocomplete: "off", list: "desc-suggest", full: true })}
        ${Field.chips({ label: "Categoría", name: "categoryId", value: e.categoryId, options: st.categories.map(c => [c.id, c.icon, c.name]) })}
        ${Field.input({ label: "Fecha", name: "date", type: "date", value: e.date, required: true, full: Boolean(existing) })}
        ${!existing && Field.select({ label: "Cuotas", name: "cuotas", value: 1, options: cuotaOptions, id: "exp-cuotas" })}
        <p class="hint-line field--full" data-cuotas-hint aria-live="polite"></p>
        ${Field.cardTax(existing ? Boolean(e.cardTax) : true, e.currency)}
        <details class="field--full more"${attrs({ open: Boolean(existing && (e.paymentMethod || e.recurring)) })}>
          <summary>Más opciones</summary>
          <div class="form-grid">
            ${Field.input({ label: "Método de pago", name: "paymentMethod", value: e.paymentMethod, list: "payment-methods", autocomplete: "off", full: true })}
            ${!e.templateId && !e.subscriptionId && !e.installmentId && Field.checkbox({ label: "Se repite todos los meses (alquiler, expensas…)", name: "recurring", checked: e.recurring })}
          </div>
        </details>
      </div>${paymentDatalist()}${QuickEntry.descriptionsDatalist(st.expenses)}`,
      focus: existing ? null : 'input[name="amount"]',
      onReady: form => {
        QuickEntry.wire(form, "expense", st.expenses);
        Field.wireCardTax(form);
        const cuotas = $('select[name="cuotas"]', form);
        const hint = $("[data-cuotas-hint]", form);
        if (!cuotas) return;
        const update = () => {
          const n = Number(cuotas.value);
          const total = toNumber($('input[name="amount"]', form).value);
          const currency = $('select[name="currency"]', form).value;
          const method = $('input[name="paymentMethod"]', form);
          if (n > 1 && method && !method.value) method.value = "Tarjeta de crédito";
          hint.textContent = n > 1
            ? `${n} cuotas${total ? ` de ${Money.format(total / n, currency)}` : ""}. La primera queda en la fecha elegida y las demás se cargan solas cada mes.`
            : "";
        };
        form.addEventListener("input", update);
        form.addEventListener("change", update);
      },
      onDelete: existing && (() => Store.commitWithUndo(`Eliminaste “${existing.description}”.`, state => {
        state.expenses = state.expenses.filter(x => x.id !== id);
      })),
      onSubmit: data => {
        const values = {
          description: data.description.trim(), amount: toNumber(data.amount), currency: data.currency, date: data.date,
          categoryId: data.categoryId, paymentMethod: data.paymentMethod.trim(), recurring: data.recurring === "on",
          ...(data.cardTax === "on" && data.currency !== "ARS" ? { cardTax: true } : {}),
        };
        const count = Number(data.cuotas) || 1;
        if (!existing && count > 1) {
          Store.commit(state => {
            state.installments.push(Schema.installment({
              id: uid(), description: values.description, amount: Math.round((values.amount / count) * 100) / 100, count,
              currency: values.currency, firstDate: values.date, categoryId: values.categoryId,
              paymentMethod: values.paymentMethod || "Tarjeta de crédito", cardTax: values.cardTax, done: 0,
            }, { ids: new Set(state.categories.map(c => c.id)), fallback: Finance.defaultCategoryId() }));
            Finance.settle();
          });
          Toast.show(`Cargaste ${values.description} en ${count} cuotas de ${Money.format(values.amount / count, values.currency)}.`, { actionLabel: "Ver cuotas", onAction: () => Router.go("cuotas") });
          return;
        }
        Store.commit(state => {
          if (existing) {
            const target = state.expenses.find(x => x.id === id);
            Object.assign(target, values, { recurring: values.recurring && !target.templateId && !target.subscriptionId && !target.installmentId });
            if (!values.cardTax) delete target.cardTax;
            delete target.demo;
          } else {
            state.expenses.push({ id: uid(), ...values });
          }
          Finance.settle();
        });
        Toast.show(existing ? "Gasto actualizado." : `Registraste ${Money.format(values.amount, values.currency)} en ${values.description}.`);
      },
    });
  },

  income(id) {
    const st = Store.state;
    const existing = id ? st.incomes.find(i => i.id === id) : null;
    if (id && !existing) return;
    const i = existing ?? { description: "", amount: "", currency: st.settings.baseCurrency, date: Dates.today(), sourceId: "sueldo", recurring: false };
    Modal.open({
      title: existing ? "Editar ingreso" : "Nuevo ingreso",
      description: existing?.templateId ? "Lo generó la app a partir de un ingreso fijo mensual." : "",
      body: html`<div class="form-grid">
        ${!existing && QuickEntry.recentsHTML(QuickEntry.recents(st.incomes))}
        ${Field.number({ label: "Monto", name: "amount", value: i.amount, required: true, min: "0.01" })}
        ${Field.select({ label: "Moneda", name: "currency", value: i.currency, options: currencyOptions() })}
        <div class="quick field--full" data-quick>${QuickEntry.amountsHTML(i.currency)}</div>
        ${Field.input({ label: "Descripción", name: "description", value: i.description, required: true, maxlength: 80, placeholder: "Sueldo, trabajo, venta…", autocomplete: "off", list: "desc-suggest", full: true })}
        ${Field.chips({ label: "Tipo de ingreso", name: "sourceId", value: i.sourceId, options: INCOME_SOURCES.map(x => [x.id, x.icon, x.name]) })}
        ${Field.input({ label: "Fecha", name: "date", type: "date", value: i.date, required: true, full: true })}
        ${!i.templateId && Field.checkbox({ label: "Se repite todos los meses (sueldo, un alquiler que cobrás…)", name: "recurring", checked: i.recurring })}
      </div>${QuickEntry.descriptionsDatalist(st.incomes)}`,
      focus: existing ? null : 'input[name="amount"]',
      onReady: form => QuickEntry.wire(form, "income", st.incomes),
      onDelete: existing && (() => Store.commitWithUndo(`Eliminaste “${existing.description}”.`, state => {
        state.incomes = state.incomes.filter(x => x.id !== id);
      })),
      onSubmit: data => {
        const values = {
          description: data.description.trim(), amount: toNumber(data.amount), currency: data.currency,
          date: data.date, sourceId: data.sourceId, recurring: data.recurring === "on",
        };
        Store.commit(state => {
          if (existing) {
            const target = state.incomes.find(x => x.id === id);
            Object.assign(target, values, { recurring: values.recurring && !target.templateId });
            delete target.demo;
          } else {
            state.incomes.push({ id: uid(), ...values });
          }
          Finance.settle();
        });
        Toast.show(existing ? "Ingreso actualizado." : `Registraste un ingreso de ${Money.format(values.amount, values.currency)}.`);
      },
    });
  },
};
