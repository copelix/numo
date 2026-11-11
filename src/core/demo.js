import { Inflation } from "./inflation.js";
import { Schema } from "./schema.js";
import { Dates } from "../lib/dates.js";

/* =========================================================================
   7. DATOS DE EJEMPLO (marcados con demo: true para poder borrarlos)
   ========================================================================= */
export const Demo = {
  add(state) {
    const today = Dates.today();
    const plus = days => Dates.addDays(today, days);
    const ctx = { ids: new Set(state.categories.map(c => c.id)), fallback: state.categories[0].id };

    const sub = (name, amount, currency, frequency, inDays, categoryId, paymentMethod, extra = {}) =>
      state.subscriptions.push(
        Schema.subscription(
          {
            name,
            amount,
            currency,
            frequency,
            nextDate: plus(inDays),
            categoryId,
            paymentMethod,
            status: "activa",
            usage: "alto",
            demo: true,
            ...extra,
          },
          ctx,
        ),
      );

    sub("Netflix", 12999, "ARS", "mensual", 2, "entretenimiento", "Tarjeta de crédito");
    sub("Spotify", 4.99, "USD", "mensual", 5, "entretenimiento", "Tarjeta de crédito", {
      cardTax: true,
      priceHistory: [
        { date: plus(-90), amount: 3.99 },
        { date: plus(-20), amount: 4.99 },
      ],
    });
    sub("iCloud", 2.99, "USD", "mensual", 1, "tecnologia", "Tarjeta de crédito", { cardTax: true });
    sub("Gimnasio", 45000, "ARS", "mensual", 9, "salud", "Tarjeta de débito", {
      usage: "bajo",
      notes: "Voy una vez por semana",
    });
    sub("Seguro de la moto", 25000, "ARS", "trimestral", 24, "transporte", "Transferencia", { usage: "" });
    sub("Hosting web", 120, "USD", "anual", 41, "tecnologia", "Tarjeta de crédito", { cardTax: true });
    sub("Disney+", 9500, "ARS", "mensual", 16, "entretenimiento", "Billetera virtual", { status: "pausada" });

    const base = [
      ["Supermercado", 68000, "comida", 4, "Tarjeta de débito"],
      ["Supermercado", 54000, "comida", 18, "Tarjeta de débito"],
      ["Salida con amigos", 26000, "comida", 12, "Efectivo"],
      ["Carga SUBE", 15000, "transporte", 2, "Tarjeta de débito"],
      ["Nafta", 34000, "transporte", 22, "Tarjeta de crédito"],
      ["Farmacia", 11500, "salud", 9, "Tarjeta de débito"],
    ];
    // Un año de gastos: los meses viejos, con los precios de ese momento (descontando la inflación)
    const variation = [1, 0.94, 1.08, 0.9, 1.03, 0.86, 0.97, 1.05, 0.92, 1.01, 0.95, 1.06, 0.93, 1.02];
    variation.forEach((factor, back) => {
      const monthKey = Dates.monthKey(-back);
      const prices = Inflation.factor(monthKey, Dates.monthKey(0)).factor;
      for (const [description, amount, categoryId, day, paymentMethod] of base) {
        const date = `${monthKey}-${Dates.pad(day)}`;
        if (date > today) continue;
        state.expenses.push(
          Schema.expense(
            {
              description,
              amount: Math.round((amount * factor) / prices / 100) * 100,
              currency: "ARS",
              date,
              categoryId,
              paymentMethod,
              demo: true,
            },
            ctx,
          ),
        );
      }
    });
    state.expenses.push(
      Schema.expense(
        {
          description: "Expensas",
          amount: 98000,
          currency: "ARS",
          date: `${Dates.monthKey(-13)}-10`,
          categoryId: "hogar",
          paymentMethod: "Transferencia",
          recurring: true,
          demo: true,
        },
        ctx,
      ),
    );
    // Una compra en cuotas y un asado para dividir
    state.installments.push(
      Schema.installment(
        {
          description: "Heladera",
          amount: 54000,
          count: 12,
          currency: "ARS",
          firstDate: `${Dates.monthKey(-3)}-10`,
          categoryId: "hogar",
          paymentMethod: "Tarjeta de crédito",
          demo: true,
        },
        ctx,
      ),
    );
    state.shared.push(
      Schema.sharedEvent({
        name: "Asado del sábado",
        date: plus(-2),
        currency: "ARS",
        people: ["Yo", "Pitote", "Garu", "Baren"],
        demo: true,
        items: [
          { description: "Carne y achuras", amount: 48000, paidBy: 0, among: [0, 1, 2, 3] },
          { description: "Bebidas", amount: 18000, paidBy: 1, among: [0, 1, 2, 3] },
          { description: "Carbón y hielo", amount: 6000, paidBy: 2, among: [0, 1, 2, 3] },
        ],
      }),
    );
    state.expenses.push(
      Schema.expense(
        {
          description: "Auriculares",
          amount: 58000,
          currency: "ARS",
          date: `${Dates.monthKey(-1)}-07`,
          categoryId: "tecnologia",
          paymentMethod: "Tarjeta de crédito",
          demo: true,
        },
        ctx,
      ),
    );
    state.expenses.push(
      Schema.expense(
        {
          description: "Regalo de cumpleaños",
          amount: 22000,
          currency: "ARS",
          date: `${Dates.monthKey(-3)}-15`,
          categoryId: "otros",
          paymentMethod: "Efectivo",
          demo: true,
        },
        ctx,
      ),
    );

    // Ingresos de ejemplo: un sueldo fijo mensual y algunos trabajos sueltos
    state.incomes.push(
      Schema.income({
        description: "Sueldo",
        amount: 950000,
        currency: "ARS",
        date: `${Dates.monthKey(-5)}-01`,
        sourceId: "sueldo",
        recurring: true,
        demo: true,
      }),
    );
    for (const [back, day, amount] of [
      [-4, 14, 300],
      [-2, 20, 250],
      [-1, 9, 180],
    ]) {
      state.incomes.push(
        Schema.income({
          description: "Trabajo freelance",
          amount,
          currency: "USD",
          date: `${Dates.monthKey(back)}-${Dates.pad(day)}`,
          sourceId: "freelance",
          demo: true,
        }),
      );
    }
    state.incomes.push(
      Schema.income({
        description: "Venta de ropa usada",
        amount: 45000,
        currency: "ARS",
        date: `${Dates.monthKey(-3)}-26`,
        sourceId: "ventas",
        demo: true,
      }),
    );

    state.goals.push(
      Schema.goal({ name: "Fondo de emergencia", target: 1000000, saved: 380000, deadline: plus(180), demo: true }),
    );
    state.goals.push(
      Schema.goal({ name: "Vacaciones", target: 1500000, saved: 450000, deadline: plus(270), demo: true }),
    );
    if (!Object.keys(state.categoryBudgets).length)
      state.categoryBudgets = { comida: 160000, entretenimiento: 40000, transporte: 60000 };
  },

  remove(state) {
    state.subscriptions = state.subscriptions.filter(x => !x.demo);
    state.expenses = state.expenses.filter(x => !x.demo);
    state.goals = state.goals.filter(x => !x.demo);
    state.incomes = state.incomes.filter(x => !x.demo);
    state.installments = state.installments.filter(x => !x.demo);
    state.shared = state.shared.filter(x => !x.demo);
  },
};
