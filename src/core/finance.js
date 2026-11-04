import { FREQUENCIES, INCOME_SOURCES, UNKNOWN_CATEGORY } from "../config.js";
import { Money } from "./money.js";
import { Store } from "./store.js";
import { Dates } from "../lib/dates.js";
import { uid } from "../lib/utils.js";

/* =========================================================================
   6. LÓGICA DE NEGOCIO (cálculos sobre el estado)
   ========================================================================= */
export const Finance = {
  get s() {
    return Store.state;
  },

  category(id) {
    return this.s.categories.find(c => c.id === id) ?? UNKNOWN_CATEGORY;
  },
  defaultCategoryId() {
    return this.s.categories.some(c => c.id === "otros") ? "otros" : this.s.categories[0].id;
  },

  activeSubscriptions() {
    return this.s.subscriptions.filter(s => s.status === "activa");
  },
  monthlyCost(sub) {
    return Money.cost(sub) * FREQUENCIES[sub.frequency].perMonth;
  },
  subscriptionsMonthlyTotal() {
    return this.activeSubscriptions().reduce((t, s) => t + this.monthlyCost(s), 0);
  },

  sum(expenses) {
    return expenses.reduce((t, e) => t + Money.cost(e), 0);
  },
  expensesInMonth(monthKey) {
    return this.s.expenses.filter(e => e.date.startsWith(monthKey));
  },
  spentInMonth(monthKey) {
    return this.sum(this.expensesInMonth(monthKey));
  },
  spentUntilDay(monthKey, day) {
    return this.sum(this.expensesInMonth(monthKey).filter(e => Dates.dayOf(e.date) <= day));
  },

  incomeSource(id) {
    const source = INCOME_SOURCES.find(x => x.id === id) ?? INCOME_SOURCES[INCOME_SOURCES.length - 1];
    return { ...source, color: "#59d499" };
  },
  incomesInMonth(monthKey) {
    return this.s.incomes.filter(i => i.date.startsWith(monthKey));
  },
  earnedInMonth(monthKey) {
    return this.sum(this.incomesInMonth(monthKey));
  },
  /** Ingresos fijos expresados por mes. */
  fixedIncomeMonthly() {
    return this.sum(this.s.incomes.filter(i => i.recurring));
  },

  totalsBy(expenses, keyOf) {
    const map = new Map();
    for (const e of expenses) map.set(keyOf(e), (map.get(keyOf(e)) ?? 0) + Money.cost(e));
    return [...map.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
  },
  totalsByCategory(expenses) {
    return this.totalsBy(expenses, e => e.categoryId).map(({ key, total }) => ({
      category: this.category(key),
      total,
    }));
  },

  /** Próxima fecha de un movimiento mensual (gasto o ingreso): un mes después de su última repetición. */
  nextRecurringDate(template, list = this.s.expenses) {
    const last = list
      .filter(e => e.templateId === template.id)
      // biome-ignore lint/complexity/useMathMinMax: las fechas son textos AAAA-MM-DD, Math.max no sirve
      .reduce((max, e) => (e.date > max ? e.date : max), template.date);
    return Dates.addMonths(last, 1, Dates.dayOf(template.date));
  },

  /** Todos los pagos que vienen: suscripciones activas + gastos fijos mensuales. */
  upcoming() {
    const today = Dates.today();
    const subs = this.activeSubscriptions().map(s => ({
      kind: "subscription",
      id: s.id,
      name: s.name,
      amount: s.amount,
      currency: s.currency,
      categoryId: s.categoryId,
      paymentMethod: s.paymentMethod,
      date: s.nextDate,
      cardTax: Boolean(s.cardTax),
    }));
    const fixed = this.s.expenses
      .filter(e => e.recurring)
      .map(e => ({
        kind: "recurring",
        id: e.id,
        name: e.description,
        amount: e.amount,
        currency: e.currency,
        categoryId: e.categoryId,
        paymentMethod: e.paymentMethod,
        date: this.nextRecurringDate(e),
        cardTax: Boolean(e.cardTax),
      }));
    const cuotas = this.activeInstallments().map(p => ({
      kind: "installment",
      id: p.id,
      name: `${p.description} · cuota ${p.done + 1}/${p.count}`,
      amount: p.amount,
      currency: p.currency,
      categoryId: p.categoryId,
      paymentMethod: p.paymentMethod,
      date: this.installmentDate(p, p.done),
      cardTax: Boolean(p.cardTax),
    }));
    return [...subs, ...fixed, ...cuotas]
      .map(p => ({ ...p, days: Dates.diff(p.date, today) }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  },

  /** Vencimientos que caen dentro de un mes (para el calendario). */
  occurrencesInMonth(monthKey) {
    const first = Dates.parse(`${monthKey}-01`);
    const start = `${monthKey}-01`;
    const end = `${monthKey}-${Dates.pad(Dates.daysInMonth(first.getFullYear(), first.getMonth()))}`;
    const out = [];
    const collect = (date, step, info) => {
      for (let d = date, guard = 0; d <= end && guard < 400; d = step(d), guard++) {
        if (d >= start) out.push({ ...info, date: d });
      }
    };
    for (const s of this.activeSubscriptions()) {
      collect(s.nextDate, d => Dates.addPeriod(d, s.frequency, s.anchorDay), {
        id: s.id,
        name: s.name,
        amount: s.amount,
        currency: s.currency,
        categoryId: s.categoryId,
      });
    }
    for (const e of this.s.expenses.filter(x => x.recurring)) {
      collect(this.nextRecurringDate(e), d => Dates.addMonths(d, 1, Dates.dayOf(e.date)), {
        id: e.id,
        name: e.description,
        amount: e.amount,
        currency: e.currency,
        categoryId: e.categoryId,
        cardTax: Boolean(e.cardTax),
      });
    }
    for (const p of this.activeInstallments()) {
      for (let i = p.done; i < p.count; i++) {
        const date = this.installmentDate(p, i);
        if (date > end) break;
        if (date >= start)
          out.push({
            id: p.id,
            name: `${p.description} · cuota ${i + 1}/${p.count}`,
            amount: p.amount,
            currency: p.currency,
            categoryId: p.categoryId,
            cardTax: Boolean(p.cardTax),
            date,
          });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  },

  latestPriceChange(sub) {
    const h = sub.priceHistory;
    if (h.length < 2) return null;
    const [prev, last] = h.slice(-2);
    return prev.amount !== last.amount ? { from: prev.amount, to: last.amount, date: last.date } : null;
  },

  /** Sugerencias: pausadas, poco usadas o con aumento de precio. */
  toReview() {
    return this.s.subscriptions
      .filter(s => s.status !== "cancelada")
      .map(sub => {
        const reasons = [];
        if (sub.status === "pausada") reasons.push("Está pausada: ¿la das de baja?");
        if (sub.usage === "bajo") reasons.push("La usás poco");
        const change = this.latestPriceChange(sub);
        if (change && change.to > change.from)
          reasons.push(
            `Subió de ${Money.format(change.from, sub.currency)} a ${Money.format(change.to, sub.currency)}`,
          );
        return { sub, reasons };
      })
      .filter(x => x.reasons.length);
  },

  expenseFromSubscription(sub, date) {
    return {
      id: uid(),
      description: sub.name,
      amount: sub.amount,
      currency: sub.currency,
      date,
      categoryId: sub.categoryId,
      paymentMethod: sub.paymentMethod,
      recurring: false,
      subscriptionId: sub.id,
      ...(sub.cardTax ? { cardTax: true } : {}),
      ...(sub.demo ? { demo: true } : {}),
    };
  },

  /* ---------- Cuotas ---------- */
  installmentDate(plan, index) {
    return Dates.addMonths(plan.firstDate, index, Dates.dayOf(plan.firstDate));
  },
  activeInstallments() {
    return this.s.installments.filter(p => p.done < p.count);
  },
  /** Lo que falta pagar de un plan (cuotas todavía no registradas). */
  installmentLeft(plan) {
    return (plan.count - plan.done) * Money.cost(plan);
  },
  /** Total de cuotas que caen en un mes, de todos los planes. */
  installmentsInMonth(monthKey) {
    let total = 0;
    for (const p of this.s.installments) {
      for (let i = 0; i < p.count; i++) {
        const key = this.installmentDate(p, i).slice(0, 7);
        if (key > monthKey) break;
        if (key === monthKey) total += Money.cost(p);
      }
    }
    return total;
  },
  expenseFromInstallment(plan, index) {
    return {
      id: uid(),
      description: plan.description,
      amount: plan.amount,
      currency: plan.currency,
      date: this.installmentDate(plan, index),
      categoryId: plan.categoryId,
      paymentMethod: plan.paymentMethod,
      recurring: false,
      installmentId: plan.id,
      installmentN: index + 1,
      installmentCount: plan.count,
      ...(plan.cardTax ? { cardTax: true } : {}),
      ...(plan.demo ? { demo: true } : {}),
    };
  },

  /**
   * Pone el estado al día: registra los cobros de suscripciones que ya pasaron
   * y genera las repeticiones de los gastos mensuales. Devuelve cuántos cambios hizo.
   */
  settle() {
    const state = this.s;
    const today = Dates.today();
    let changes = 0;

    for (const sub of this.activeSubscriptions()) {
      for (let guard = 0; sub.nextDate < today && guard < 520; guard++) {
        if (state.settings.autoLogSubscriptions) state.expenses.push(this.expenseFromSubscription(sub, sub.nextDate));
        sub.nextDate = Dates.addPeriod(sub.nextDate, sub.frequency, sub.anchorDay);
        changes++;
      }
    }

    for (const plan of state.installments) {
      for (
        let guard = 0;
        plan.done < plan.count && this.installmentDate(plan, plan.done) <= today && guard < 130;
        guard++
      ) {
        state.expenses.push(this.expenseFromInstallment(plan, plan.done));
        plan.done++;
        changes++;
      }
    }

    for (const template of state.expenses.filter(e => e.recurring)) {
      let next = this.nextRecurringDate(template);
      for (let guard = 0; next <= today && guard < 240; guard++) {
        state.expenses.push({
          id: uid(),
          description: template.description,
          amount: template.amount,
          currency: template.currency,
          date: next,
          categoryId: template.categoryId,
          paymentMethod: template.paymentMethod,
          recurring: false,
          templateId: template.id,
          ...(template.cardTax ? { cardTax: true } : {}),
          ...(template.demo ? { demo: true } : {}),
        });
        next = Dates.addMonths(next, 1, Dates.dayOf(template.date));
        changes++;
      }
    }

    for (const template of state.incomes.filter(i => i.recurring)) {
      let next = this.nextRecurringDate(template, state.incomes);
      for (let guard = 0; next <= today && guard < 240; guard++) {
        state.incomes.push({
          id: uid(),
          description: template.description,
          amount: template.amount,
          currency: template.currency,
          date: next,
          sourceId: template.sourceId,
          recurring: false,
          templateId: template.id,
          ...(template.demo ? { demo: true } : {}),
        });
        next = Dates.addMonths(next, 1, Dates.dayOf(template.date));
        changes++;
      }
    }
    return changes;
  },
};
