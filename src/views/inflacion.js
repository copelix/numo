import { DEFAULT_IPC, INDEC_IPC_URL } from "../config.js";
import { Inflation } from "../core/inflation.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { capitalize, numberText } from "../lib/utils.js";
import { icon } from "../ui/icons.js";
import { subHead } from "./index.js";

export const InflacionViews = {
  /* ---------- Inflación (IPC del INDEC) ---------- */
  inflacion() {
    const table = Inflation.table();
    const own = Store.state.settings.ipc;
    const latest = [Inflation.expectedLatest(), Inflation.lastKnown()].sort().pop();
    const months = Array.from({ length: 13 }, (_, i) => Dates.shiftMonth(latest, -i));
    const missing = Inflation.missing();
    const last = Inflation.lastKnown();
    const year = last.slice(0, 4);
    const ytd = Inflation.accumulated(Array.from({ length: Number(last.slice(5)) }, (_, i) => `${year}-${Dates.pad(i + 1)}`));
    const yoy = Inflation.accumulated(Array.from({ length: 12 }, (_, i) => Dates.shiftMonth(last, -i)));
    return html`
      ${subHead({ title: "Inflación", subtitle: "IPC del INDEC: se usa para comparar tus gastos en pesos de hoy" })}
      ${missing.length > 0 && html`<div class="banner" role="status">${icon("bell")}<div>
        <strong>Falta la inflación de ${missing.map(k => Dates.monthName(k)).join(" y ")}</strong>
        <p class="small">El INDEC la publica a mediados del mes siguiente. Buscala en <a class="link" href="${INDEC_IPC_URL}" target="_blank" rel="noopener">indec.gob.ar</a> y cargala abajo. Mientras tanto, Numo usa el último dato.</p>
      </div></div>`}
      <div class="grid grid--stats">
        <article class="card"><p class="eyebrow">${capitalize(Dates.monthName(last))}</p><p class="stat__value">${Inflation.pct(Inflation.rate(last))}</p><p class="stat__note">Último dato cargado</p></article>
        <article class="card"><p class="eyebrow">En lo que va de ${year}</p><p class="stat__value">${Inflation.pct(ytd.pct)}</p><p class="stat__note">Acumulada, ${ytd.months} ${ytd.months === 1 ? "mes" : "meses"}</p></article>
        <article class="card"><p class="eyebrow">Últimos 12 meses</p><p class="stat__value">${Inflation.pct(yoy.pct)}</p><p class="stat__note">Interanual a ${Dates.monthName(last)}</p></article>
      </div>
      <section class="card section narrow">
        <header class="card__head"><h2 class="card__title">Mes a mes</h2><span class="eyebrow">% mensual</span></header>
        <div class="table-wrap"><table class="ipc">
          <thead><tr><th scope="col">Mes</th><th scope="col">Inflación</th><th scope="col">Fuente</th></tr></thead>
          <tbody>${months.map(k => {
            const value = table[k];
            const mineSet = Object.hasOwn(own, k);
            return html`<tr class="${value === undefined ? "is-missing" : ""}">
              <td>${capitalize(Dates.monthName(k))}</td>
              <td><input class="input" type="text" inputmode="decimal" autocomplete="off" id="ipc-${k}" data-ipc="${k}" value="${value === undefined ? "" : numberText(value)}" placeholder="Falta" aria-label="Inflación de ${Dates.monthName(k)} en %"></td>
              <td class="small muted">${value === undefined ? "Sin dato" : mineSet ? (Object.hasOwn(DEFAULT_IPC, k) ? "Corregido por vos" : "Cargado por vos") : "INDEC"}</td>
            </tr>`;
          })}</tbody>
        </table></div>
        <p class="small muted" style="margin-top:12px">Si borrás un valor que vino con la app, vuelve el del INDEC.</p>
      </section>`;
  },
};
