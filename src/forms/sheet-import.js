import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { applyMovements, buildMovements, guessMapping, parseDate, readTable } from "../core/sheet-import.js";
import { Store } from "../core/store.js";
import { attrs, html } from "../lib/html.js";
import { $, $$ } from "../lib/utils.js";
import { Field } from "../ui/fields.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

/** Qué se le pregunta a la persona, en orden. Los dos primeros y el monto hacen falta sí o sí. */
const COLUMNS = [
  ["date", "Fecha"],
  ["description", "Descripción"],
  ["amount", "Monto (o gastos)"],
  ["income", "Ingresos, si van en otra columna"],
  ["type", "Tipo (gasto o ingreso)"],
  ["category", "Categoría"],
  ["paymentMethod", "Método de pago"],
  ["currency", "Moneda"],
];
/** Con cuenta, todo se guarda en un solo registro de hasta 1 MB comprimido: más o menos 3 MB de texto. */
const CLOUD_LIMIT = 2_500_000;
/** Hojas que no son movimientos (las que agrega el Excel que exporta Numo): arrancan sin marcar. */
const SUMMARY_SHEET = /^(resumen|suscripciones|cuotas)$/i;

export const SheetImportForms = {
  /** Importar una planilla propia. sheets: [{ name, rows }] tal como salen del Excel o del CSV. */
  importSheet(fileName, rawSheets) {
    const sheets = rawSheets
      .map(s => ({ name: s.name, ...readTable(s.rows) }))
      .filter(s => s.data.some(r => r.some(v => v !== "")));
    if (!sheets.length) {
      Toast.show("El archivo no tiene datos para importar.");
      return;
    }
    const headers = [...new Set(sheets.flatMap(s => s.headers))];
    const guess = guessMapping(headers);
    // Los años que aparecen en la columna de fecha, para poder importar solo los últimos
    const years = [
      ...new Set(
        sheets.flatMap(s => {
          const i = s.headers.indexOf(guess.date);
          return i < 0 ? [] : s.data.map(r => parseDate(r[i]).slice(0, 4));
        }),
      ),
    ]
      .filter(Boolean)
      .sort();
    const options = [["", "—"], ...headers.map(h => [h, h])];

    Modal.open({
      title: "Importar desde Excel",
      description: `${fileName}: elegí qué columna es cada cosa. Lo que ya tengas cargado no se repite.`,
      submitLabel: "Importar",
      body: html`<div class="form-grid">
        <div class="field--full import-preview" data-import-preview aria-live="polite"></div>
        ${
          sheets.length > 1 &&
          html`<fieldset class="field field--full import-sheets"><legend>Hojas</legend>${sheets.map(
            (s, i) =>
              html`<label class="check"><input type="checkbox" name="sheet" value="${i}"${attrs({ checked: !SUMMARY_SHEET.test(s.name) })}><span>${s.name}</span></label>`,
          )}</fieldset>`
        }
        ${COLUMNS.map(([field, label]) => Field.select({ label, name: `col-${field}`, value: guess[field] ?? "", options }))}
        ${
          years.length > 1 &&
          Field.select({
            label: "Desde",
            name: "from",
            value: "",
            options: [["", `Todo (desde ${years[0]})`], ...years.slice(1).map(y => [y, y])],
          })
        }
      </div>`,
      onReady: form => {
        const update = () => {
          const { result, error } = this.readForm(form, sheets);
          $("[data-import-preview]", form).innerHTML = String(this.previewHTML(result, error));
          const submit = $('button[type="submit"]', form);
          const total = result ? result.expenses.length + result.incomes.length : 0;
          submit.textContent = total ? `Importar ${total.toLocaleString("es-AR")}` : "Importar";
          submit.disabled = !total;
        };
        form.addEventListener("change", update);
        update();
      },
      onSubmit: (_data, form) => {
        const { result } = this.readForm(form, sheets);
        const total = result ? result.expenses.length + result.incomes.length : 0;
        if (!total) return false;
        Store.commitWithUndo(
          `Importaste ${total.toLocaleString("es-AR")} ${total === 1 ? "movimiento" : "movimientos"}.`,
          state => {
            applyMovements(state, result, Finance.defaultCategoryId());
            Finance.settle();
          },
        );
      },
    });
  },

  readForm(form, sheets) {
    const mapping = Object.fromEntries(COLUMNS.map(([field]) => [field, $(`select[name="col-${field}"]`, form).value]));
    const boxes = $$('input[name="sheet"]', form);
    const chosen = boxes.length ? boxes.filter(b => b.checked).map(b => sheets[Number(b.value)]) : sheets;
    if (!chosen.length) return { error: "Elegí al menos una hoja." };
    if (!mapping.date) return { error: "Elegí la columna de la fecha." };
    if (!mapping.amount && !mapping.income) return { error: "Elegí la columna del monto." };
    const from = $('select[name="from"]', form)?.value;
    const st = Store.state;
    const result = buildMovements(chosen, mapping, {
      baseCurrency: st.settings.baseCurrency,
      existing: [...st.expenses, ...st.incomes],
      from: from ? `${from}-01-01` : "",
    });
    return { result };
  },

  previewHTML(result, error) {
    if (error) return html`<p class="hint-line">${error}</p>`;
    const { expenses, incomes, skipped, duplicates, rule, first, last } = result;
    const total = expenses.length + incomes.length;
    if (!total)
      return html`<p class="hint-line">No encontramos filas con fecha y monto en esas columnas.${duplicates ? ` ${duplicates} ya estaban cargadas.` : ""}</p>`;
    const sample = [...expenses.map(x => ({ ...x, income: false })), ...incomes.map(x => ({ ...x, income: true }))]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    const size = JSON.stringify(Store.state).length + total * 200;
    const n = v => v.toLocaleString("es-AR");
    return html`<p class="import-preview__summary"><strong>${n(expenses.length)} ${expenses.length === 1 ? "gasto" : "gastos"} y ${n(incomes.length)} ${incomes.length === 1 ? "ingreso" : "ingresos"}</strong>, ${first.slice(0, 7) === last.slice(0, 7) ? `de ${month(first)}` : `de ${month(first)} a ${month(last)}`}.</p>
      <p class="small muted">${rule}${duplicates ? ` ${n(duplicates)} ya estaban cargados y no se repiten.` : ""}${skipped ? ` ${n(skipped)} filas sin fecha o monto se omiten.` : ""}</p>
      ${
        size > CLOUD_LIMIT &&
        html`<p class="small import-preview__warn">Son muchos datos para sincronizar con la cuenta. Si después no se guarda en la nube, importá desde un año más reciente.</p>`
      }
      <div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Monto</th></tr></thead><tbody>${sample.map(
        x =>
          html`<tr><td>${x.date.split("-").reverse().join("/")}</td><td>${x.description}</td><td class="num"${attrs({ "data-income": x.income })}>${x.income ? "+" : "−"}${Money.format(x.amount, x.currency)}</td></tr>`,
      )}</tbody></table></div>`;
  },
};

/** "2024-03-15" → "marzo de 2024". */
function month(date) {
  const [y, m] = date.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}
