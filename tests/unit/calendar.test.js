import { beforeEach, describe, expect, it } from "vitest";
import { Schema } from "../../src/core/schema.js";
import { Store } from "../../src/core/store.js";
import { Calendar } from "../../src/ui/calendar.js";

beforeEach(() => {
  Store.state = Schema.normalize({ version: 2 });
});

const sub = {
  id: "s1",
  name: "Netflix, plan estándar",
  amount: 9999,
  currency: "ARS",
  frequency: "mensual",
  nextDate: "2026-12-31",
  anchorDay: 31,
  paymentMethod: "Tarjeta de crédito",
};

/** Junta las líneas cortadas (las que siguen empiezan con un espacio). */
const unfold = text => text.replace(/\r\n /g, "");

describe("archivo .ics para Apple Calendar", () => {
  it("arma un evento de día completo que se repite y avisa el día anterior", () => {
    const ics = Calendar.ics([Calendar.event(sub, "subscription")], new Date("2026-11-11T12:00:00Z"));
    const text = unfold(ics);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain("UID:s1@numo");
    expect(text).toContain("DTSTAMP:20261111T120000Z");
    expect(text).toContain("DTSTART;VALUE=DATE:20261231");
    expect(text).toContain("DTEND;VALUE=DATE:20270101");
    expect(text).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1");
    expect(text).toContain("TRIGGER:-PT15H");
    // Las comas y los saltos de línea van escapados
    expect(text).toContain("SUMMARY:Pago de Netflix\\, plan estándar");
    expect(text).toMatch(/DESCRIPTION:Cobro de .*\\nSe paga con: Tarjeta de crédito\.\\nAgregado desde Numo\./);
  });

  it("corta las líneas largas a 75 bytes sin partir los acentos", () => {
    const long = { ...sub, name: "Suscripción ñandú ".repeat(8) };
    const ics = Calendar.ics([Calendar.event(long, "subscription")]);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`Pago de ${long.name}`);
  });

  it("pone varios cobros en un solo archivo", () => {
    const fixed = {
      id: "e1",
      description: "Alquiler",
      amount: 500000,
      currency: "ARS",
      date: "2026-11-05",
      recurring: true,
    };
    const ics = Calendar.ics([Calendar.event(sub, "subscription"), Calendar.event(fixed, "fixed")]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:e1@numo");
    expect(ics).toContain("RRULE:FREQ=MONTHLY\r\n");
  });

  it("anual y semanal usan su propia regla", () => {
    expect(Calendar.rule("anual", 10)).toBe("FREQ=YEARLY");
    expect(Calendar.rule("semanal", 10)).toBe("FREQ=WEEKLY");
    expect(Calendar.rule("trimestral", 10)).toBe("FREQ=MONTHLY;INTERVAL=3");
  });
});
