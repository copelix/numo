import { FREQUENCIES } from "../config.js";

/* =========================================================================
   2. FECHAS (siempre texto "AAAA-MM-DD" en hora local)
   ========================================================================= */
export const Dates = {
  pad: n => String(n).padStart(2, "0"),
  iso(date) {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  },
  parse(text) {
    const [y, m, d] = String(text).split("-").map(Number);
    return new Date(y, m - 1, d);
  },
  isValid(text) {
    return /^\d{4}-\d{2}-\d{2}$/.test(text ?? "") && this.iso(this.parse(text)) === text;
  },
  today() {
    return this.iso(new Date());
  },
  dayOf: text => Number(String(text).slice(8, 10)),
  daysInMonth: (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate(),
  addDays(text, n) {
    const d = this.parse(text);
    d.setDate(d.getDate() + n);
    return this.iso(d);
  },
  /** Suma meses respetando el día de cobro (31 ene + 1 mes = 28 feb, y en marzo vuelve al 31). */
  addMonths(text, n, anchorDay) {
    const d = this.parse(text);
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    target.setDate(Math.min(anchorDay || d.getDate(), this.daysInMonth(target.getFullYear(), target.getMonth())));
    return this.iso(target);
  },
  addPeriod(text, frequency, anchorDay) {
    const f = FREQUENCIES[frequency] ?? FREQUENCIES.mensual;
    return f.months ? this.addMonths(text, f.months, anchorDay) : this.addDays(text, f.days);
  },
  diff(a, b) {
    return Math.round((this.parse(a) - this.parse(b)) / 86400000);
  },
  monthKey(offset = 0) {
    const now = new Date();
    return this.iso(new Date(now.getFullYear(), now.getMonth() + offset, 1)).slice(0, 7);
  },
  /** "2026-03" + 2 → "2026-05". */
  shiftMonth(key, n) {
    const [y, m] = key.split("-").map(Number);
    return this.iso(new Date(y, m - 1 + n, 1)).slice(0, 7);
  },
  monthName(monthKey, style = "long") {
    return this.parse(`${monthKey}-01`)
      .toLocaleDateString("es-AR", style === "long" ? { month: "long", year: "numeric" } : { month: "short" })
      .replace(".", "");
  },
  formatShort(text) {
    return this.parse(text)
      .toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })
      .replace(/\./g, "");
  },
  formatLong(text) {
    return this.parse(text).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  },
  relative(days) {
    if (days < -1) return `hace ${-days} días`;
    if (days === -1) return "ayer";
    if (days === 0) return "hoy";
    if (days === 1) return "mañana";
    return `en ${days} días`;
  },
};
