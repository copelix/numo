import { CONFIG, CURRENCIES, DEFAULT_CARD_TAX, DEFAULT_CATEGORIES, DEFAULT_RATES, FREQUENCIES, INCOME_SOURCES, STATUSES, USAGE } from "../config.js";
import { Dates } from "../lib/dates.js";
import { asArray, clamp, deepClone, isHexColor, toNumber, uid } from "../lib/utils.js";
import { icon } from "../ui/icons.js";
import { Theme } from "../ui/theme.js";

/* =========================================================================
   4. ESQUEMA DE DATOS: estado inicial, validación y migración desde la v1
   ========================================================================= */
export function createInitialState() {
  return {
    version: CONFIG.schemaVersion,
    meta: { updatedAt: 0 },
    settings: { baseCurrency: "ARS", monthlyBudget: 900000, remindDays: 3, autoLogSubscriptions: true, theme: "system", cardTax: DEFAULT_CARD_TAX, ipc: {}, rates: { ...DEFAULT_RATES } },
    categories: deepClone(DEFAULT_CATEGORIES),
    subscriptions: [],
    incomes: [],
    expenses: [],
    goals: [],
    categoryBudgets: {},
    installments: [],
    shared: [],
  };
}
/** Lleva una fecha pasada al primer cobro igual o posterior a hoy, sin registrar nada. */
export function nextOnOrAfter(date, frequency, anchorDay, reference = Dates.today()) {
  let current = date;
  for (let guard = 0; current < reference && guard < 1000; guard++) current = Dates.addPeriod(current, frequency, anchorDay);
  return current;
}
export const Schema = {
  /** Recibe cualquier cosa (localStorage, nube, archivo importado) y devuelve un estado válido. */
  normalize(raw) {
    const base = createInitialState();
    if (!raw || typeof raw !== "object") return base;
    const src = raw.version >= 2 ? raw : this.fromV1(raw);

    const settings = { ...base.settings, ...(src.settings ?? {}) };
    settings.rates = { ...DEFAULT_RATES, ...(src.settings?.rates ?? {}) };
    for (const c of CURRENCIES) settings.rates[c] = toNumber(settings.rates[c]) > 0 ? toNumber(settings.rates[c]) : DEFAULT_RATES[c];
    settings.rates.USD = 1;
    if (!CURRENCIES.includes(settings.baseCurrency)) settings.baseCurrency = "ARS";
    settings.monthlyBudget = Math.max(0, toNumber(settings.monthlyBudget));
    settings.remindDays = [1, 3, 7].includes(Number(settings.remindDays)) ? Number(settings.remindDays) : 3;
    settings.autoLogSubscriptions = settings.autoLogSubscriptions !== false;
    settings.theme = Theme.OPTIONS.some(([v]) => v === settings.theme) ? settings.theme : "system";
    settings.cardTax = src.settings?.cardTax === undefined ? DEFAULT_CARD_TAX : clamp(toNumber(settings.cardTax), 0, 200);
    const ipc = {};
    for (const [key, value] of Object.entries(src.settings?.ipc ?? {})) {
      if (/^\d{4}-\d{2}$/.test(key) && value !== "" && value !== null && Number.isFinite(Number(value))) ipc[key] = clamp(Number(value), -50, 100);
    }
    settings.ipc = ipc;

    const rawCategories = asArray(src.categories).length ? src.categories : base.categories;
    const categories = rawCategories.map(c => this.category(c));
    const ctx = { ids: new Set(categories.map(c => c.id)) };
    ctx.fallback = ctx.ids.has("otros") ? "otros" : categories[0].id;

    const categoryBudgets = {};
    for (const [id, value] of Object.entries(src.categoryBudgets ?? {})) {
      if (ctx.ids.has(id) && toNumber(value) > 0) categoryBudgets[id] = toNumber(value);
    }

    return {
      version: CONFIG.schemaVersion,
      meta: { updatedAt: Number(src.meta?.updatedAt) || 0 },
      settings,
      categories,
      subscriptions: asArray(src.subscriptions).map(s => this.subscription(s, ctx)).filter(Boolean),
      expenses: asArray(src.expenses).map(e => this.expense(e, ctx)).filter(Boolean),
      goals: asArray(src.goals).map(g => this.goal(g)).filter(Boolean),
      incomes: asArray(src.incomes).map(i => this.income(i)).filter(Boolean),
      categoryBudgets,
      installments: asArray(src.installments).map(p => this.installment(p, ctx)).filter(Boolean),
      shared: asArray(src.shared).map(x => this.sharedEvent(x)).filter(Boolean),
    };
  },

  /** Compra en cuotas: genera un gasto por mes. "done" cuenta las cuotas ya registradas. */
  installment(p, ctx) {
    if (!p || !String(p.description ?? "").trim() || !Dates.isValid(p.firstDate)) return null;
    const amount = Math.max(0, toNumber(p.amount));
    if (!amount) return null;
    const count = clamp(Math.round(Number(p.count) || 0), 2, 120);
    return {
      id: String(p.id || uid()),
      description: String(p.description).trim().slice(0, 80),
      amount,
      count,
      currency: CURRENCIES.includes(p.currency) ? p.currency : "ARS",
      firstDate: p.firstDate,
      categoryId: ctx.ids.has(p.categoryId) ? p.categoryId : ctx.fallback,
      paymentMethod: String(p.paymentMethod ?? "").slice(0, 40),
      done: clamp(Math.round(Number(p.done) || 0), 0, count),
      ...(p.cardTax ? { cardTax: true } : {}),
      ...(p.demo ? { demo: true } : {}),
    };
  },

  /** Gasto compartido: la persona 0 sos vos. Cada gasto dice quién pagó y entre quiénes se divide. */
  sharedEvent(x) {
    if (!x || !String(x.name ?? "").trim()) return null;
    const people = asArray(x.people).map(p => String(p ?? "").trim().slice(0, 30)).filter(Boolean).slice(0, 20);
    if (people.length < 2) return null;
    const n = people.length;
    const items = asArray(x.items).map(it => {
      const amount = Math.max(0, toNumber(it?.amount));
      if (!amount || !String(it?.description ?? "").trim()) return null;
      const among = [...new Set(asArray(it.among).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b);
      return {
        id: String(it.id || uid()),
        description: String(it.description).trim().slice(0, 60),
        amount,
        paidBy: clamp(Math.round(Number(it.paidBy) || 0), 0, n - 1),
        among: among.length ? among : people.map((_, i) => i),
      };
    }).filter(Boolean);
    return {
      id: String(x.id || uid()),
      name: String(x.name).trim().slice(0, 60),
      date: Dates.isValid(x.date) ? x.date : Dates.today(),
      currency: CURRENCIES.includes(x.currency) ? x.currency : "ARS",
      people,
      items,
      settled: Boolean(x.settled),
      ...(x.expenseId ? { expenseId: String(x.expenseId) } : {}),
      ...(x.demo ? { demo: true } : {}),
    };
  },

  category(c) {
    return {
      id: String(c?.id || uid()),
      name: String(c?.name || "Sin nombre").slice(0, 40),
      icon: String(c?.icon || "🏷️").slice(0, 8),
      color: isHexColor(c?.color) ? c.color : "#9c9c9d",
    };
  },

  subscription(s, ctx) {
    if (!s || !String(s.name ?? "").trim()) return null;
    const nextDate = Dates.isValid(s.nextDate) ? s.nextDate : Dates.today();
    const amount = Math.max(0, toNumber(s.amount));
    const priceHistory = asArray(s.priceHistory)
      .filter(h => Dates.isValid(h?.date))
      .map(h => ({ date: h.date, amount: Math.max(0, toNumber(h.amount)) }));
    return {
      id: String(s.id || uid()),
      name: String(s.name).trim().slice(0, 80),
      amount,
      currency: CURRENCIES.includes(s.currency) ? s.currency : "ARS",
      frequency: FREQUENCIES[s.frequency] ? s.frequency : "mensual",
      nextDate,
      anchorDay: clamp(Number(s.anchorDay) || Dates.dayOf(nextDate), 1, 31),
      categoryId: ctx.ids.has(s.categoryId) ? s.categoryId : ctx.fallback,
      paymentMethod: String(s.paymentMethod ?? "").slice(0, 40),
      notes: String(s.notes ?? "").slice(0, 300),
      status: STATUSES[s.status] ? s.status : "activa",
      usage: Object.hasOwn(USAGE, s.usage ?? "") ? (s.usage ?? "") : "",
      priceHistory: priceHistory.length ? priceHistory : [{ date: Dates.today(), amount }],
      ...(s.calendarKey ? { calendarKey: String(s.calendarKey).slice(0, 80) } : {}),
      ...(s.cardTax ? { cardTax: true } : {}),
      ...(s.demo ? { demo: true } : {}),
    };
  },

  expense(e, ctx) {
    if (!e || !String(e.description ?? "").trim() || !Dates.isValid(e.date)) return null;
    return {
      id: String(e.id || uid()),
      description: String(e.description).trim().slice(0, 80),
      amount: Math.max(0, toNumber(e.amount)),
      currency: CURRENCIES.includes(e.currency) ? e.currency : "ARS",
      date: e.date,
      categoryId: ctx.ids.has(e.categoryId) ? e.categoryId : ctx.fallback,
      paymentMethod: String(e.paymentMethod ?? "").slice(0, 40),
      recurring: Boolean(e.recurring) && !e.templateId && !e.subscriptionId && !e.installmentId,
      ...(e.calendarKey && e.recurring ? { calendarKey: String(e.calendarKey).slice(0, 80) } : {}),
      ...(e.templateId ? { templateId: String(e.templateId) } : {}),
      ...(e.subscriptionId ? { subscriptionId: String(e.subscriptionId) } : {}),
      ...(e.installmentId ? {
        installmentId: String(e.installmentId),
        installmentN: clamp(Math.round(Number(e.installmentN) || 1), 1, 120),
        installmentCount: clamp(Math.round(Number(e.installmentCount) || 1), 1, 120),
      } : {}),
      ...(e.cardTax ? { cardTax: true } : {}),
      ...(e.demo ? { demo: true } : {}),
    };
  },

  income(i) {
    if (!i || !String(i.description ?? "").trim() || !Dates.isValid(i.date)) return null;
    return {
      id: String(i.id || uid()),
      description: String(i.description).trim().slice(0, 80),
      amount: Math.max(0, toNumber(i.amount)),
      currency: CURRENCIES.includes(i.currency) ? i.currency : "ARS",
      date: i.date,
      sourceId: INCOME_SOURCES.some(x => x.id === i.sourceId) ? i.sourceId : "otros",
      recurring: Boolean(i.recurring) && !i.templateId,
      ...(i.templateId ? { templateId: String(i.templateId) } : {}),
      ...(i.demo ? { demo: true } : {}),
    };
  },

  goal(g) {
    if (!g || !String(g.name ?? "").trim() || toNumber(g.target) <= 0) return null;
    return {
      id: String(g.id || uid()),
      name: String(g.name).trim().slice(0, 60),
      target: toNumber(g.target),
      saved: Math.max(0, toNumber(g.saved)),
      deadline: Dates.isValid(g.deadline) ? g.deadline : "",
      ...(g.demo ? { demo: true } : {}),
    };
  },

  /** Traduce los datos de la versión anterior de la app (nombres de campos cortos). */
  fromV1(old) {
    const s = old.settings ?? {};
    return {
      meta: { updatedAt: 0 },
      settings: { baseCurrency: s.base, monthlyBudget: s.budget, remindDays: s.remind, rates: s.rates },
      categories: old.cats,
      categoryBudgets: old.catBudgets,
      subscriptions: asArray(old.subs).map(x => {
        const anchorDay = Dates.isValid(x.next) ? Dates.dayOf(x.next) : 1;
        const nextDate = Dates.isValid(x.next) ? nextOnOrAfter(x.next, x.freq, anchorDay) : Dates.today();
        return {
          id: x.id, name: x.name, amount: x.amount, currency: x.cur, frequency: x.freq, nextDate, anchorDay,
          categoryId: x.cat, paymentMethod: x.pay, notes: x.notes, status: x.status, usage: x.usage, demo: x.demo,
          priceHistory: x.prevAmount ? [{ date: Dates.today(), amount: x.prevAmount }, { date: Dates.today(), amount: x.amount }] : [],
        };
      }),
      expenses: asArray(old.exps).map(x => ({
        id: x.id, description: x.desc, amount: x.amount, currency: x.cur, date: x.date,
        categoryId: x.cat, paymentMethod: x.pay, recurring: x.rec, templateId: x.parent, demo: x.demo,
      })),
      goals: asArray(old.goals).map(g => ({ ...g, deadline: g.date })),
    };
  },
};
