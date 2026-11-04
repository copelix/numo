import { Router } from "../app/router.js";
import { UIState } from "../app/state.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Schema } from "../core/schema.js";
import { Shared } from "../core/shared.js";
import { Store } from "../core/store.js";
import { Forms } from "./index.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { $, toNumber, uid } from "../lib/utils.js";
import { currencyOptions, Field } from "../ui/fields.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

export const SharedForms = {
  /** Cuenta compartida (crear o editar personas). */
  shared(id) {
    const st = Store.state;
    const existing = id ? Shared.find(id) : null;
    if (id && !existing) return;
    const used = new Set(existing ? existing.items.flatMap(it => [it.paidBy, ...it.among]) : []);
    Modal.open({
      title: existing ? "Editar cuenta compartida" : "Nueva cuenta compartida",
      description: existing
        ? "Podés cambiar nombres y sumar personas. Solo se puede sacar a alguien si no tiene gastos."
        : "Después cargás quién pagó qué.",
      body: html`<div class="form-grid">
        ${Field.input({ label: "Nombre", name: "name", value: existing?.name ?? "", required: true, maxlength: 60, placeholder: "Asado del sábado, viaje a Mendoza…", autocomplete: "off", full: true })}
        ${Field.input({ label: "Fecha", name: "date", type: "date", value: existing?.date ?? Dates.today(), required: true })}
        ${Field.select({ label: "Moneda", name: "currency", value: existing?.currency ?? st.settings.baseCurrency, options: currencyOptions() })}
        ${
          existing
            ? existing.people.map((p, i) =>
                Field.input({
                  label: i === 0 ? "Tu nombre" : `Persona ${i + 1}`,
                  name: `person-${i}`,
                  value: p,
                  maxlength: 30,
                  required: i === 0 || used.has(i),
                  autocomplete: "off",
                  hint: i > 0 && !used.has(i) ? "Dejalo vacío para sacarlo." : "",
                }),
              )
            : Field.input({
                label: "Tu nombre",
                name: "person-0",
                value: "Yo",
                maxlength: 30,
                required: true,
                autocomplete: "off",
              })
        }
        ${Field.input({ label: existing ? "Sumar personas" : "Con quién", name: "more", maxlength: 400, placeholder: "Pitote, Garu, Baren", autocomplete: "off", full: true, required: !existing, hint: "Separá los nombres con comas." })}
      </div>`,
      focus: existing ? null : 'input[name="name"]',
      deleteLabel: "Eliminar cuenta",
      onDelete:
        existing &&
        (() => {
          Store.commitWithUndo(`Eliminaste “${existing.name}”.`, state => {
            state.shared = state.shared.filter(x => x.id !== id);
          });
          Router.go("compartidos");
        }),
      onSubmit: (data, form) => {
        const more = data.more
          .split(/[,;\n]/)
          .map(x => x.trim().slice(0, 30))
          .filter(Boolean);
        const kept = existing
          ? existing.people.map((_, i) => (data[`person-${i}`] ?? "").trim().slice(0, 30))
          : [(data["person-0"] || "Yo").trim()];
        const people = [...kept.filter(Boolean), ...more];
        if (people.length < 2) {
          const input = $('input[name="more"]', form);
          input.setCustomValidity("Agregá al menos una persona más.");
          input.reportValidity();
          return false;
        }
        if (people.length > 20) {
          const input = $('input[name="more"]', form);
          input.setCustomValidity("Hasta 20 personas por cuenta.");
          input.reportValidity();
          return false;
        }
        // Índices viejos → nuevos (los que quedaron vacíos se sacan)
        const map = new Map();
        let next = 0;
        kept.forEach((name, i) => {
          if (name) map.set(i, next++);
        });
        const newId = existing?.id ?? uid();
        Store.commit(state => {
          const values = { name: data.name.trim(), date: data.date, currency: data.currency, people };
          if (existing) {
            const target = state.shared.find(x => x.id === id);
            Object.assign(target, values);
            target.items = target.items.map(it => ({
              ...it,
              paidBy: map.get(it.paidBy),
              among: it.among.map(i => map.get(i)).filter(i => i !== undefined),
            }));
            delete target.demo;
          } else {
            state.shared.push(Schema.sharedEvent({ id: newId, ...values, items: [] }));
          }
        });
        UIState.sharedId = newId;
        if (Router.current() !== "compartido") Router.go("compartido");
        if (!existing) setTimeout(() => Forms.sharedItem(newId), 50);
      },
    });
  },

  /** Un gasto dentro de una cuenta compartida. */
  sharedItem(eventId, itemId) {
    const ev = Shared.find(eventId);
    if (!ev) return;
    const existing = itemId ? ev.items.find(it => it.id === itemId) : null;
    if (itemId && !existing) return;
    const it = existing ?? { description: "", amount: "", paidBy: 0, among: ev.people.map((_, i) => i) };
    Modal.open({
      title: existing ? "Editar gasto" : `Agregar a “${ev.name}”`,
      body: html`<div class="form-grid">
        ${Field.input({ label: "Qué se pagó", name: "description", value: it.description, required: true, maxlength: 60, placeholder: "Carne, bebidas, nafta…", autocomplete: "off", full: true })}
        ${Field.number({ label: `Monto (${ev.currency})`, name: "amount", value: it.amount, required: true, min: "0.01" })}
        ${Field.select({ label: "Lo pagó", name: "paidBy", value: it.paidBy, options: ev.people.map((p, i) => [i, i === 0 ? `${p} (vos)` : p]) })}
        <fieldset class="field field--full" style="border:0;padding:0;margin:0"><legend style="margin-bottom:6px">Se divide entre</legend>
          <div class="check-list">${ev.people.map((p, i) => html`<label class="check"><input type="checkbox" name="among-${i}"${attrs({ checked: it.among.includes(i) })}><span>${p}</span></label>`)}</div>
        </fieldset>
        <p class="form-error field--full" role="alert" data-item-error></p>
      </div>`,
      focus: existing ? null : 'input[name="description"]',
      onDelete:
        existing &&
        (() =>
          Store.commitWithUndo(`Sacaste “${existing.description}”.`, state => {
            const target = state.shared.find(x => x.id === eventId);
            target.items = target.items.filter(x => x.id !== itemId);
          })),
      onSubmit: (data, form) => {
        const among = ev.people.map((_, i) => i).filter(i => data[`among-${i}`] === "on");
        if (!among.length) {
          $("[data-item-error]", form).textContent = "Elegí al menos una persona para dividir.";
          return false;
        }
        const values = {
          description: data.description.trim(),
          amount: toNumber(data.amount),
          paidBy: Number(data.paidBy),
          among,
        };
        Store.commit(state => {
          const target = state.shared.find(x => x.id === eventId);
          if (existing)
            Object.assign(
              target.items.find(x => x.id === itemId),
              values,
            );
          else target.items.push({ id: uid(), ...values });
          target.settled = false;
          delete target.demo;
        });
        Toast.show(existing ? "Gasto actualizado." : `Agregaste ${values.description}.`);
      },
    });
  },

  /** Anota en tus gastos lo que te tocó pagar en una cuenta compartida. */
  sharedMine(eventId) {
    const ev = Shared.find(eventId);
    if (!ev) return;
    const share = Shared.balances(ev)[0].share;
    const st = Store.state;
    Modal.open({
      title: "Anotar mi parte",
      description: `Te tocó ${Money.format(share, ev.currency)} de “${ev.name}”. Se suma a tus gastos con esta categoría y fecha.`,
      submitLabel: "Anotar",
      body: html`<div class="form-grid">
        ${Field.chips({ label: "Categoría", name: "categoryId", value: st.categories.some(c => c.id === "comida") ? "comida" : Finance.defaultCategoryId(), options: st.categories.map(c => [c.id, c.icon, c.name]) })}
        ${Field.input({ label: "Fecha", name: "date", type: "date", value: ev.date, required: true, full: true })}
      </div>`,
      onSubmit: data => {
        const expenseId = uid();
        Store.commit(state => {
          state.expenses.push(
            Schema.expense(
              {
                id: expenseId,
                description: `${ev.name} (mi parte)`,
                amount: Math.round(share * 100) / 100,
                currency: ev.currency,
                date: data.date,
                categoryId: data.categoryId,
                paymentMethod: "",
              },
              { ids: new Set(state.categories.map(c => c.id)), fallback: Finance.defaultCategoryId() },
            ),
          );
          state.shared.find(x => x.id === eventId).expenseId = expenseId;
        });
        Toast.show(`Anotaste ${Money.format(share, ev.currency)} en tus gastos.`);
      },
    });
  },
};
