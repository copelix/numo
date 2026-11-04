import { UIState } from "../app/state.js";
import { FREQUENCIES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Inflation } from "../core/inflation.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { capitalize } from "../lib/utils.js";
import { Charts } from "../ui/charts.js";
import { UI } from "../ui/components.js";
import { Views } from "./index.js";

export const InformesViews = {
  /* ---------- Informes ---------- */
  informes() {
    const months = UIState.reportMonths;
    const keys = Array.from({ length: months }, (_, i) => Dates.monthKey(i - months + 1));
    const expenses = Store.state.expenses.filter(e => keys.includes(e.date.slice(0, 7)));
    const total = Finance.sum(expenses);
    const average = total / months;
    const incomes = Store.state.incomes.filter(i => keys.includes(i.date.slice(0, 7)));
    const earnedTotal = Finance.sum(incomes);
    const saved = earnedTotal - total;
    const perMonth = keys.map(key => ({ key, total: Finance.spentInMonth(key), earned: Finance.earnedInMonth(key) }));
    const peak = perMonth.reduce((a, b) => (b.total > a.total ? b : a), perMonth[0]);
    const byCategory = Finance.totalsByCategory(expenses);
    const biggest = [...expenses].sort((a, b) => Money.cost(b) - Money.cost(a)).slice(0, 5);
    const subsMonthly = Finance.subscriptionsMonthlyTotal();
    const topSubs = [...Finance.activeSubscriptions()].sort((a, b) => Finance.monthlyCost(b) - Finance.monthlyCost(a)).slice(0, 3);
    const share = (value, of) => (of > 0 ? Math.round((value / of) * 100) : 0);

    return html`
      ${UI.pageHead({
        title: "Informes",
        subtitle: `${capitalize(Dates.monthName(keys[0]))} a ${Dates.monthName(keys[keys.length - 1])}`,
        actions: UI.segmented({ key: "reportMonths", value: months, label: "Período", options: [[3, "3 meses"], [6, "6 meses"], [12, "12 meses"]] }),
      })}
      <div class="grid grid--stats">
        <article class="card"><p class="eyebrow">Ingresos del período</p><p class="stat__value" data-count="${earnedTotal}">${Money.format(earnedTotal)}</p><p class="stat__note">${Money.format(earnedTotal / months)} por mes en promedio</p></article>
        <article class="card"><p class="eyebrow">Gastos del período</p><p class="stat__value" data-count="${total}">${Money.format(total)}</p><p class="stat__note">${Money.format(average)} por mes · suscripciones: ${share(subsMonthly, average)}%</p></article>
        <article class="card"><p class="eyebrow">Ahorro del período</p><p class="stat__value">${earnedTotal ? Money.format(saved) : "—"}</p>
          <p class="stat__note">${!earnedTotal ? html`<button type="button" class="link-btn" data-action="new-income">Cargá tus ingresos</button> para calcularlo.` : saved >= 0 ? `Guardaste el ${share(saved, earnedTotal)}% de lo que entró.` : "Gastaste más de lo que entró."}</p></article>
        <article class="card"><p class="eyebrow">Mes más caro</p><p class="stat__value">${Money.format(peak.total)}</p><p class="stat__note">${capitalize(Dates.monthName(peak.key))}</p></article>
      </div>
      <section class="card section">
        <header class="card__head"><h2 class="card__title">Ingresos y gastos por mes</h2></header>
        ${Charts.pairs(perMonth)}
      </section>
      ${Views.inflationCard()}
      ${expenses.length
        ? html`<div class="grid section">
            <section class="card"><header class="card__head"><h2 class="card__title">En qué se fue la plata</h2></header>
              ${Charts.donut(byCategory, total, { from: `${keys[0]}-01`, to: Dates.today() })}</section>
            <section class="card"><header class="card__head"><h2 class="card__title">Suscripciones más caras</h2><a class="link small" href="#/suscripciones">Ver todas</a></header>
              ${topSubs.length
                ? html`<ol class="list">${topSubs.map(s => html`<li class="item">
                    ${UI.avatar(Finance.category(s.categoryId))}
                    <div class="item__body"><span class="item__title"><span>${s.name}</span></span><span class="item__meta">${FREQUENCIES[s.frequency].label} · ${Money.format(s.amount, s.currency)}</span></div>
                    <div class="item__end"><span class="item__amount">${Money.format(Finance.monthlyCost(s))}</span><span class="small muted">por mes</span></div>
                  </li>`)}</ol>`
                : UI.empty({ iconName: "repeat", title: "Sin suscripciones activas" })}</section>
          </div>
          <section class="card section">
            <header class="card__head"><h2 class="card__title">Los 5 gastos más grandes</h2></header>
            <ul class="list">${biggest.map(e => UI.expenseRow(e))}</ul>
          </section>`
        : html`<div class="card section">${UI.empty({ iconName: "chart", title: "Sin gastos en este período" })}</div>`}`;
  },

  /* ---------- Informes: tus gastos contra la inflación ---------- */
  inflationCard() {
    const back = UIState.inflationBack;
    const target = Dates.monthKey(-1);                     // último mes completo
    const base = Dates.shiftMonth(target, -back);
    const now = Finance.spentInMonth(target);
    const then = Finance.spentInMonth(base);
    const { factor, estimated } = Inflation.factor(base, target);
    const adjusted = then * factor;
    const head = html`<header class="card__head"><h2 class="card__title">Tus gastos contra la inflación</h2>
      ${UI.segmented({ key: "inflationBack", value: back, label: "Comparar con", options: [[1, "1 mes"], [6, "6 meses"], [12, "1 año"]] })}</header>`;
    if (!then || !now) {
      return html`<section class="card section">${head}${UI.empty({
        iconName: "trend",
        title: `Te faltan gastos de ${Dates.monthName(!then ? base : target)}`,
        text: "Cuando tengas los dos meses cargados, acá vas a ver si gastás más o menos de verdad, descontando la inflación.",
      })}</section>`;
    }
    const real = (now / adjusted - 1) * 100;
    const nominal = (now / then - 1) * 100;
    const max = Math.max(now, adjusted, then, 1);
    const width = v => `${Math.round((v / max) * 100)}%`;
    const good = real <= 0;
    const byCat = Finance.totalsByCategory(Finance.expensesInMonth(target)).slice(0, 4).map(({ category, total }) => {
      const before = Finance.totalsByCategory(Finance.expensesInMonth(base)).find(x => x.category.id === category.id)?.total ?? 0;
      return { category, change: before ? (total / (before * factor) - 1) * 100 : null };
    });
    return html`<section class="card section">${head}
      <p class="verdict">Gastaste <span class="delta ${good ? "delta--good" : "delta--bad"}">${Math.abs(real).toLocaleString("es-AR", { maximumFractionDigits: 0 })}% ${good ? "menos" : "más"}</span> que en ${Dates.monthName(base)}, descontando la inflación.</p>
      <p class="small muted">En pesos, ${nominal >= 0 ? "subió" : "bajó"} ${Inflation.pct(nominal)}; los precios subieron ${Inflation.pct((factor - 1) * 100)} en ese tiempo.</p>
      <div class="compare">
        <div class="compare__row"><span>${capitalize(Dates.monthName(target))}</span><strong class="delta">${Money.format(now)}</strong>
          <span class="compare__bar compare__bar--now"><span style="width:${width(now)}"></span></span></div>
        <div class="compare__row"><span>${capitalize(Dates.monthName(base))}, en pesos de hoy <span class="muted small">(eran ${Money.format(then)})</span></span><strong class="delta">${Money.format(Math.round(adjusted))}</strong>
          <span class="compare__bar"><span style="width:${width(adjusted)}"></span></span></div>
      </div>
      ${byCat.some(x => x.change !== null) && html`<ul class="mini-list" aria-label="Por categoría, descontando la inflación">${byCat.filter(x => x.change !== null).map(x => html`<li>
        <span>${x.category.icon} ${x.category.name}</span>
        <span class="delta ${x.change <= 0 ? "delta--good" : "delta--bad"}">${Inflation.pct(x.change)}</span></li>`)}</ul>`}
      <p class="small muted" style="margin-top:12px">Inflación del INDEC (IPC).${estimated.length > 0 && ` Para ${estimated.map(k => Dates.monthName(k, "short")).join(" y ")} todavía no hay dato: usamos el último publicado.`} <a class="link" href="#/inflacion">Ver o cargar datos</a></p>
    </section>`;
  },
};
