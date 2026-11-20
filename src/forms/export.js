import { collect, fileName, PARTS, PERIODS, span } from "../core/export.js";
import { Store } from "../core/store.js";
import { Transfer } from "../core/transfer.js";
import { Dates } from "../lib/dates.js";
import { attrs, html } from "../lib/html.js";
import { $, $$ } from "../lib/utils.js";
import { Backup } from "../sync/backup.js";
import { Sync } from "../sync/sync.js";
import { Field } from "../ui/fields.js";
import { icon } from "../ui/icons.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

const n = v => v.toLocaleString("es-AR");
const plural = (count, one, many) => `${n(count)} ${count === 1 ? one : many}`;
/** "2024-03-15" → "marzo de 2024". */
const month = date => {
  const [y, m] = date.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
};
/** Lo incluido, en palabras: "320 gastos, 24 ingresos y 5 suscripciones". */
function listed(data) {
  const parts = [
    data.expenses.length && plural(data.expenses.length, "gasto", "gastos"),
    data.incomes.length && plural(data.incomes.length, "ingreso", "ingresos"),
    data.subscriptions.length && plural(data.subscriptions.length, "suscripción", "suscripciones"),
    data.installments.length && plural(data.installments.length, "compra en cuotas", "compras en cuotas"),
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
}
const size = bytes =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export const ExportForms = {
  /** Planilla: elegir período, qué incluir y formato, con el resumen de lo que se va a bajar. */
  exportSheet() {
    const st = Store.state;
    const today = Dates.today();
    const totals = {
      expenses: st.expenses.length,
      incomes: st.incomes.length,
      subscriptions: st.subscriptions.length,
      installments: st.installments.length,
    };
    const choice = html`<div class="choice" role="radiogroup" aria-label="Período">${Object.entries(PERIODS).map(
      ([key, p]) =>
        html`<label class="choice__opt"><input type="radio" name="period" value="${key}"${attrs({ checked: key === "year" })}><span>${p.label}</span></label>`,
    )}</div>`;

    Modal.open({
      title: "Exportar a Excel",
      description: "Para ver tus números en Excel, Google Sheets o Numbers, o mandárselos a tu contador.",
      submitLabel: "Descargar",
      body: html`<div class="form-grid">
        <div class="field field--full"><span>Período</span>${choice}</div>
        <div class="field--full form-grid" data-custom hidden>
          ${Field.input({ label: "Desde", name: "from", type: "date", value: `${today.slice(0, 4)}-01-01`, max: today })}
          ${Field.input({ label: "Hasta", name: "to", type: "date", value: today })}
        </div>
        <fieldset class="field field--full export-parts"><legend>Qué incluir</legend>
          ${Object.entries(PARTS).map(
            ([key, label]) =>
              html`<label class="check"><input type="checkbox" name="part" value="${key}"${attrs({ checked: totals[key] > 0, disabled: !totals[key] })}><span>${label}</span><span class="export-parts__count" data-count="${key}"></span></label>`,
          )}
        </fieldset>
        <div class="field field--full"><span>Formato</span><div class="choice" role="radiogroup" aria-label="Formato">
          <label class="choice__opt"><input type="radio" name="format" value="xlsx" checked><span>Excel (.xlsx)</span></label>
          <label class="choice__opt"><input type="radio" name="format" value="csv"><span>CSV</span></label>
        </div></div>
        <div class="field--full export-summary" data-summary aria-live="polite"></div>
      </div>`,
      onReady: form => {
        const update = () => {
          const { data, format, error } = this.readSheetForm(form);
          // Las fechas solo cuentan con "Elegir fechas": si no, se ocultan y no se validan
          const custom = $('input[name="period"]:checked', form).value === "custom";
          $("[data-custom]", form).hidden = !custom;
          for (const input of $$("[data-custom] input", form)) input.disabled = !custom;
          // Cuántos hay de cada cosa en el período elegido
          const all = collect({ from: data.from, to: data.to });
          for (const key of Object.keys(PARTS)) $(`[data-count="${key}"]`, form).textContent = n(all[key].length);
          const total = Object.keys(PARTS).reduce((t, k) => t + data[k].length, 0);
          const submit = $('button[type="submit"]', form);
          submit.disabled = Boolean(error) || !total;
          $("[data-summary]", form).innerHTML = String(this.sheetSummary(data, format, error, total));
        };
        form.addEventListener("change", update);
        form.addEventListener("input", e => e.target.type === "date" && update());
        update();
      },
      onSubmit: (_values, form) => {
        const { data, format, error } = this.readSheetForm(form);
        if (error) return false;
        (format === "csv" ? Transfer.exportCSV(data) : Transfer.exportXlsx(data)).then(ok => {
          if (ok) Toast.show(`Se descargó ${fileName(data, format)}.`);
        });
      },
    });
  },

  readSheetForm(form) {
    const period = $('input[name="period"]:checked', form).value;
    const today = Dates.today();
    let [from, to] = PERIODS[period].range(today);
    let error = "";
    if (period === "custom") {
      from = $('input[name="from"]', form).value;
      to = $('input[name="to"]', form).value;
      if (!from || !to) error = "Elegí las dos fechas.";
      else if (from > to) error = "La fecha “desde” tiene que ser anterior a “hasta”.";
    }
    const include = $$('input[name="part"]:checked', form).map(b => b.value);
    if (!include.length) error ||= "Elegí al menos una cosa para incluir.";
    const format = $('input[name="format"]:checked', form).value;
    return { data: collect({ from, to, include }), format, error };
  },

  sheetSummary(data, format, error, total) {
    if (error) return html`<p class="hint-line">${error}</p>`;
    if (!total) return html`<p class="hint-line">No hay nada para exportar en ese período.</p>`;
    const [first, last] = span(data);
    const when =
      first && (first.slice(0, 7) === last.slice(0, 7) ? `de ${month(first)}` : `de ${month(first)} a ${month(last)}`);
    const sheets = [
      (data.expenses.length || data.incomes.length) && "Resumen por mes",
      ...Object.entries(PARTS)
        .filter(([key]) => data[key].length)
        .map(([, label]) => label),
    ].filter(Boolean);
    return html`<div class="export-file">
      <span class="export-file__icon" aria-hidden="true">${icon("sheet")}</span>
      <div class="export-file__body">
        <strong class="export-file__name">${fileName(data, format)}</strong>
        <span class="small muted">${listed(data)}${when ? `, ${when}` : ""}.</span>
        <span class="small muted">${format === "xlsx" ? `Hojas: ${sheets.join(", ")}.` : "Una sola tabla, separada con punto y coma. Numo la puede volver a importar."}</span>
      </div>
    </div>`;
  },

  /** Copia de seguridad: qué incluye, cuándo fue la última y el botón para bajarla. */
  exportBackup() {
    const st = Store.state;
    const json = JSON.stringify(st);
    const last = Backup.last();
    const days = last ? Math.floor((Date.now() - last) / 86400000) : -1;
    const lastText =
      days < 0
        ? "Todavía no bajaste ninguna copia en este dispositivo."
        : days === 0
          ? "La última copia la bajaste hoy."
          : `La última copia la bajaste hace ${plural(days, "día", "días")}.`;
    const data = {
      expenses: st.expenses,
      incomes: st.incomes,
      subscriptions: st.subscriptions,
      installments: st.installments,
    };
    const extras = [
      st.goals.length && plural(st.goals.length, "meta", "metas"),
      st.shared.length && plural(st.shared.length, "grupo de gastos compartidos", "grupos de gastos compartidos"),
      `${plural(st.categories.length, "categoría", "categorías")} y tus ajustes`,
    ].filter(Boolean);

    Modal.open({
      title: "Copia de seguridad",
      description:
        Sync.mode === "local"
          ? "Tus datos están guardados solo en este navegador. Con una copia, si cambiás de teléfono o se borra el navegador, no perdés nada."
          : "Tus datos ya se guardan en tu cuenta. La copia es un respaldo extra que queda en tu dispositivo.",
      submitLabel: "Descargar copia",
      body: html`<div class="export-file">
          <span class="export-file__icon" aria-hidden="true">${icon("shield")}</span>
          <div class="export-file__body">
            <strong class="export-file__name">numo-copia-${Dates.today()}.json</strong>
            <span class="small muted">${[listed(data), ...extras].filter(Boolean).join(", ")}.</span>
            <span class="small muted">${size(new Blob([json]).size)} · ${lastText}</span>
          </div>
        </div>
        <p class="small muted" style="margin-top:16px">Para recuperar todo, abrí este archivo desde <strong>Más → Tus datos → Importar</strong>. Reemplaza lo que haya en ese momento. Guardala en un lugar seguro: tiene todos tus movimientos.</p>`,
      onSubmit: () => {
        Transfer.exportJSON().then(ok => {
          if (ok) Toast.show("Se descargó tu copia de seguridad.");
        });
      },
    });
  },
};
