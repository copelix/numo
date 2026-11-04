import { describe, expect, it } from "vitest";
import { Dates } from "../../src/lib/dates.js";

describe("Dates", () => {
  it("valida fechas reales", () => {
    expect(Dates.isValid("2026-02-28")).toBe(true);
    expect(Dates.isValid("2026-02-30")).toBe(false);
    expect(Dates.isValid("2026-2-3")).toBe(false);
  });
  it("suma meses respetando el día de cobro", () => {
    expect(Dates.addMonths("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(Dates.addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(Dates.addMonths("2028-01-31", 1, 31)).toBe("2028-02-29");
    expect(Dates.addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("mueve claves de mes", () => {
    expect(Dates.shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(Dates.shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("diferencia en días", () => expect(Dates.diff("2026-03-01", "2026-02-27")).toBe(2));
  it("frecuencias", () => {
    expect(Dates.addPeriod("2026-01-10", "semanal")).toBe("2026-01-17");
    expect(Dates.addPeriod("2026-01-10", "anual", 10)).toBe("2027-01-10");
  });
});
