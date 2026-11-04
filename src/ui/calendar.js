import { FREQUENCIES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { icon } from "./icons.js";

/* =========================================================================
   RECORDATORIOS EN GOOGLE CALENDAR
   Sin conexiones: un enlace que abre Google Calendar con el cobro ya cargado,
   como evento de día completo que se repite con la frecuencia de la suscripción.
   ========================================================================= */
export const Calendar = {
  /** Regla de repetición (RRULE). Para días 29–31 usa el último día disponible del mes. */
  rule(frequency, anchorDay) {
    if (frequency === "semanal") return "RRULE:FREQ=WEEKLY";
    if (frequency === "anual") return "RRULE:FREQ=YEARLY";
    const interval = frequency === "trimestral" ? ";INTERVAL=3" : "";
    if (anchorDay > 28) {
      const days = Array.from({ length: anchorDay - 27 }, (_, i) => 28 + i).join(",");
      return `RRULE:FREQ=MONTHLY${interval};BYMONTHDAY=${days};BYSETPOS=-1`;
    }
    return `RRULE:FREQ=MONTHLY${interval}`;
  },
  /** Enlace para una suscripción activa o un gasto mensual fijo. */
  link({ name, amount, currency, date, frequency = "mensual", anchorDay = Dates.dayOf(date), paymentMethod = "" }) {
    const start = date.replace(/-/g, "");
    const end = Dates.addDays(date, 1).replace(/-/g, "");
    const details = [
      `Cobro de ${name}: ${Money.format(amount, currency)} (${FREQUENCIES[frequency].label.toLowerCase()}).`,
      paymentMethod && `Se paga con: ${paymentMethod}.`,
      "Agregado desde Numo.",
    ]
      .filter(Boolean)
      .join("\n");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `Pago de ${name} · ${Money.format(amount, currency)}`,
      dates: `${start}/${end}`,
      details,
      recur: this.rule(frequency, anchorDay),
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  },
  forSubscription(sub) {
    return this.link({
      name: sub.name,
      amount: sub.amount,
      currency: sub.currency,
      date: sub.nextDate,
      frequency: sub.frequency,
      anchorDay: sub.anchorDay,
      paymentMethod: sub.paymentMethod,
    });
  },
  forFixedExpense(expense) {
    return this.link({
      name: expense.description,
      amount: expense.amount,
      currency: expense.currency,
      date: Finance.nextRecurringDate(expense),
      anchorDay: Dates.dayOf(expense.date),
      paymentMethod: expense.paymentMethod,
    });
  },
  /** ¿Ya lo agregó con estos mismos datos? Si cambió el monto o la fecha, conviene volver a agregarlo. */
  key(item) {
    return [item.amount, item.currency, item.frequency ?? "mensual", item.anchorDay ?? Dates.dayOf(item.date)].join(
      "|",
    );
  },
  isAdded(item) {
    return Boolean(item.calendarKey) && item.calendarKey === this.key(item);
  },
  button(item, kind, { compact = true } = {}) {
    const href = kind === "subscription" ? this.forSubscription(item) : this.forFixedExpense(item);
    const added = this.isAdded(item);
    const outdated = Boolean(item.calendarKey) && !added;
    return html`<a class="btn${compact ? " btn--compact" : ""}${added ? " btn--ghost" : ""}" href="${href}" target="_blank" rel="noopener"
      data-calendar="${kind}" data-id="${item.id}">${icon("calendar", 16)}${added ? "Agregado" : outdated ? "Actualizar en Calendar" : "Agregar a Google Calendar"}</a>`;
  },
};
