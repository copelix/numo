import { describe, expect, it } from "vitest";
import { clamp, isNumberText, numberText, toNumber } from "../../src/lib/utils.js";
import { html, trusted } from "../../src/lib/html.js";

describe("toNumber: montos escritos como en Argentina", () => {
  it.each([
    ["4,99", 4.99],
    ["4.99", 4.99],
    ["1.500", 1500],
    ["12.345.678", 12345678],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["$ 950.000", 950000],
    [7, 7],
    ["", 0],
    ["abc", 0],
    [NaN, 0],
  ])("%s → %s", (input, expected) => expect(toNumber(input)).toBe(expected));
});

describe("campos numéricos", () => {
  it("muestra los decimales con coma", () => expect(numberText(4.99)).toBe("4,99"));
  it("reconoce números con coma o punto", () => {
    expect(isNumberText("1.234,5")).toBe(true);
    expect(isNumberText("12a")).toBe(false);
  });
  it("clamp", () => expect([clamp(5, 0, 3), clamp(-1, 0, 3), clamp(2, 0, 3)]).toEqual([3, 0, 2]));
});

describe("plantillas html``", () => {
  it("escapa lo que escribe el usuario", () => {
    const name = '<img src=x onerror="alert(1)">';
    expect(String(html`<p>${name}</p>`)).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  });
  it("no escapa html anidado ni lo marcado como confiable", () => {
    expect(String(html`<ul>${[1, 2].map(n => html`<li>${n}</li>`)}</ul>`)).toBe("<ul><li>1</li><li>2</li></ul>");
    expect(String(html`${trusted("<b>ok</b>")}`)).toBe("<b>ok</b>");
  });
  it("false, null y undefined no dibujan nada", () => expect(String(html`${false}${null}${undefined}`)).toBe(""));
});
