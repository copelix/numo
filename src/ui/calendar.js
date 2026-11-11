import { FREQUENCIES } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { icon } from "./icons.js";

/* =========================================================================
   RECORDATORIOS EN EL CALENDARIO
   Sin conexiones, y según el dispositivo. En iPhone, iPad y Mac: un archivo .ics
   que abre Calendario con el cobro listo para agregar. En Android y el resto: un
   enlace que abre Google Calendar con el cobro ya cargado. En los dos casos es un
   evento de día completo que se repite con la frecuencia de la suscripción.
   ========================================================================= */
export const Calendar = {
  /** Regla de repetición (RRULE, sin el prefijo). Para días 29–31 usa el último día disponible del mes. */
  rule(frequency, anchorDay) {
    if (frequency === "semanal") return "FREQ=WEEKLY";
    if (frequency === "anual") return "FREQ=YEARLY";
    const interval = frequency === "trimestral" ? ";INTERVAL=3" : "";
    if (anchorDay > 28) {
      const days = Array.from({ length: anchorDay - 27 }, (_, i) => 28 + i).join(",");
      return `FREQ=MONTHLY${interval};BYMONTHDAY=${days};BYSETPOS=-1`;
    }
    return `FREQ=MONTHLY${interval}`;
  },

  /** Los datos del evento de una suscripción activa o de un gasto mensual fijo. */
  event(item, kind) {
    const base =
      kind === "subscription"
        ? { name: item.name, date: item.nextDate, frequency: item.frequency, anchorDay: item.anchorDay }
        : {
            name: item.description,
            date: Finance.nextRecurringDate(item),
            frequency: "mensual",
            anchorDay: Dates.dayOf(item.date),
          };
    const ev = {
      ...base,
      id: item.id,
      amount: item.amount,
      currency: item.currency,
      paymentMethod: item.paymentMethod ?? "",
    };
    ev.anchorDay ||= Dates.dayOf(ev.date);
    ev.title = `Pago de ${ev.name} · ${Money.format(ev.amount, ev.currency)}`;
    ev.details = [
      `Cobro de ${ev.name}: ${Money.format(ev.amount, ev.currency)} (${FREQUENCIES[ev.frequency].label.toLowerCase()}).`,
      ev.paymentMethod && `Se paga con: ${ev.paymentMethod}.`,
      "Agregado desde Numo.",
    ]
      .filter(Boolean)
      .join("\n");
    return ev;
  },

  /** Enlace que abre Google Calendar con el evento listo para guardar. */
  googleLink(ev) {
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: ev.title,
      dates: `${ev.date.replace(/-/g, "")}/${Dates.addDays(ev.date, 1).replace(/-/g, "")}`,
      details: ev.details,
      recur: `RRULE:${this.rule(ev.frequency, ev.anchorDay)}`,
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  },

  /** Archivo .ics (iCalendar) con uno o varios eventos. Avisa el día anterior a las 9. */
  ics(events, now = new Date()) {
    const text = value =>
      String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Numo//Recordatorios//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    for (const ev of events) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${ev.id}@numo`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ev.date.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${Dates.addDays(ev.date, 1).replace(/-/g, "")}`,
        `RRULE:${this.rule(ev.frequency, ev.anchorDay)}`,
        `SUMMARY:${text(ev.title)}`,
        `DESCRIPTION:${text(ev.details)}`,
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${text(ev.title)}`,
        "TRIGGER:-PT15H",
        "END:VALARM",
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return `${lines.map(fold).join("\r\n")}\r\n`;
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

  /**
   * ¿Qué calendario usa este dispositivo? iPhone, iPad y Mac → Calendario de Apple (archivo .ics);
   * Android y el resto → Google Calendar. El iPad nuevo se presenta como Mac, por eso no se mira el táctil.
   */
  platform(nav = globalThis.navigator) {
    const ua = nav?.userAgent ?? "";
    const platform = nav?.userAgentData?.platform ?? nav?.platform ?? "";
    if (/android/i.test(ua) || /android/i.test(platform)) return "google";
    if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua) || /^(iPhone|iPad|iPod|Mac|macOS)/i.test(platform))
      return "apple";
    return "google";
  },

  /** Un solo botón: abre el calendario que corresponde al dispositivo. */
  button(item, kind) {
    const added = this.isAdded(item);
    const outdated = Boolean(item.calendarKey) && !added;
    const cls = `btn btn--compact${added ? " btn--ghost" : ""}`;
    const content = html`${icon(added ? "check" : outdated ? "repeat" : "calendar", 16)}${added ? "Agregado" : outdated ? "Actualizar en el calendario" : "Agregar al calendario"}`;
    return this.platform() === "apple"
      ? html`<button type="button" class="${cls}" data-action="calendar-ics" data-kind="${kind}" data-id="${item.id}">${content}</button>`
      : html`<a class="${cls}" href="${this.googleLink(this.event(item, kind))}" target="_blank" rel="noopener"
          data-calendar="${kind}" data-id="${item.id}">${content}</a>`;
  },
};

/** Las líneas de un .ics no pueden pasar de 75 bytes: se cortan y siguen con un espacio. */
function fold(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = "",
    bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}
