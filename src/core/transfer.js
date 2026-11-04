import { App } from "../app/app.js";
import { DEFAULT_CATEGORIES, INCOME_SOURCES } from "../config.js";
import { Finance } from "./finance.js";
import { nextOnOrAfter, Schema } from "./schema.js";
import { Store } from "./store.js";
import { Dates } from "../lib/dates.js";
import { uid } from "../lib/utils.js";
import { Backup } from "../sync/backup.js";
import { Sync } from "../sync/sync.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

/* =========================================================================
   13. IMPORTAR Y EXPORTAR
   ========================================================================= */
export const Transfer = {
  CSV_COLUMNS: ["tipo", "nombre", "monto", "moneda", "fecha", "categoria", "metodo_pago", "frecuencia", "estado", "notas", "recurrente"],

  async download(filename, content, type) {
    if (Sync.downloads) {
      try {
        await Sync.downloads.save({ filename, data: content });
      } catch (error) {
        if (error?.code !== "declined") Toast.show("No se pudo exportar desde esta vista. Probá abriendo la app en claude.ai.");
      }
      return;
    }
    // Fuera de Claude: descarga común del navegador
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  exportJSON() {
    Backup.mark();
    this.download(`numo-${Dates.today()}.json`, JSON.stringify(Store.state, null, 2), "application/json");
  },

  exportCSV() {
    const st = Store.state;
    const amount = n => String(n).replace(".", ",");
    const cell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ...st.subscriptions.map(s => ["suscripcion", s.name, amount(s.amount), s.currency, s.nextDate, Finance.category(s.categoryId).name, s.paymentMethod, s.frequency, s.status, s.notes, ""]),
      ...st.expenses.map(e => ["gasto", e.description, amount(e.amount), e.currency, e.date, Finance.category(e.categoryId).name, e.paymentMethod, "", "", "", e.recurring ? "si" : "no"]),
      ...st.incomes.map(i => ["ingreso", i.description, amount(i.amount), i.currency, i.date, Finance.incomeSource(i.sourceId).name, "", "", "", "", i.recurring ? "si" : "no"]),
    ];
    const csv = [this.CSV_COLUMNS, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
    this.download(`numo-${Dates.today()}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
  },

  /** Parser de CSV con comillas; detecta solo si el separador es coma o punto y coma. */
  parseCSV(text) {
    const firstLine = text.split(/\r?\n/, 1)[0];
    const delimiter = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ";" : ",";
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(cell); cell = ""; }
      else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim()));
  },

  async importFile(file) {
    const text = (await file.text()).replace(/^\ufeff/, "");
    try {
      if (file.name.toLowerCase().endsWith(".json")) await this.importJSON(text);
      else this.importCSV(text);
    } catch (error) {
      console.error(error);
      Toast.show("No se pudo importar. Revisá que sea un JSON o CSV exportado desde esta app.");
    }
  },

  async importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || !(data.subscriptions || data.subs || data.expenses || data.exps)) throw new Error("Formato no reconocido");
    const ok = await Modal.confirm({
      title: "Importar copia completa",
      message: "Esto reemplaza todos los datos actuales por los del archivo. Si no estás seguro, exportá primero una copia.",
      confirmLabel: "Reemplazar", danger: true,
    });
    if (!ok) return;
    Store.replace(data, { touch: true });
    App.settle();
    Toast.show("Datos importados.");
  },

  importCSV(text) {
    const [header, ...rows] = this.parseCSV(text);
    if (!header) throw new Error("CSV vacío");
    const index = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
    const get = (row, column) => String(row[index[column]] ?? "").trim();
    let added = 0, skipped = 0;

    Store.commit(state => {
      const ctx = { ids: new Set(), fallback: Finance.defaultCategoryId() };
      const categoryId = name => {
        if (!name) return ctx.fallback;
        let cat = state.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (!cat) {
          cat = { id: uid(), name: name.slice(0, 40), icon: "🏷️", color: DEFAULT_CATEGORIES[state.categories.length % DEFAULT_CATEGORIES.length].color };
          state.categories.push(cat);
        }
        return cat.id;
      };
      for (const row of rows) {
        const type = get(row, "tipo").toLowerCase();
        if (type === "ingreso") {
          const source = INCOME_SOURCES.find(x => x.name.toLowerCase() === get(row, "categoria").toLowerCase());
          const income = Schema.income({
            description: get(row, "nombre"), amount: get(row, "monto"), date: get(row, "fecha"),
            currency: get(row, "moneda").toUpperCase() || state.settings.baseCurrency,
            sourceId: source?.id ?? "otros", recurring: /^(si|sí|true|1)$/i.test(get(row, "recurrente")),
          });
          if (income) { state.incomes.push(income); added++; } else skipped++;
          continue;
        }
        const common = { amount: get(row, "monto"), currency: get(row, "moneda").toUpperCase() || state.settings.baseCurrency, paymentMethod: get(row, "metodo_pago") };
        const catId = categoryId(get(row, "categoria"));
        ctx.ids = new Set(state.categories.map(c => c.id));
        const item = type === "suscripcion"
          ? Schema.subscription({ ...common, name: get(row, "nombre"), nextDate: get(row, "fecha"), frequency: get(row, "frecuencia"), status: get(row, "estado"), notes: get(row, "notas"), categoryId: catId }, ctx)
          : Schema.expense({ ...common, description: get(row, "nombre"), date: get(row, "fecha"), recurring: /^(si|sí|true|1)$/i.test(get(row, "recurrente")), categoryId: catId }, ctx);
        if (!item) { skipped++; continue; }
        if (type === "suscripcion") { item.nextDate = nextOnOrAfter(item.nextDate, item.frequency, item.anchorDay); state.subscriptions.push(item); }
        else state.expenses.push(item);
        added++;
      }
      Finance.settle();
    });
    Toast.show(`Se importaron ${added} filas${skipped ? ` (${skipped} con datos incompletos se omitieron)` : ""}.`);
  },
};
