/* La app dentro de Claude: guarda en la cuenta de Claude (simulada) y sincroniza entre dispositivos. */
import { expect, test } from "@playwright/test";
import { addExpense, app, mockClaude, watchErrors } from "./helpers.js";

const VIEWS = ["inicio", "movimientos", "suscripciones", "informes", "mas", "cuotas", "compartidos", "inflacion", "pagos", "planear", "ajustes", "cambio", "datos", "cuenta", "categorias"];

async function open(context, store) {
  await mockClaude(context, store);
  const page = await context.newPage();
  const errors = await watchErrors(page);
  await page.goto("/");
  await expect.poll(() => app(page, n => n.Sync.mode + "/" + n.Sync.status)).toBe("cloud/synced");
  return { page, errors };
}

test("abre y recorre todas las vistas en los dos temas, sin errores ni desbordes", async ({ context }) => {
  const { page, errors } = await open(context, new Map());
  for (const theme of ["dark", "light"]) {
    await app(page, (n, t) => n.Store.commit(s => { s.settings.theme = t; }), theme);
    await expect(page.locator("html")).toHaveAttribute("data-numo-theme", theme);
    for (const view of VIEWS) {
      await app(page, (n, v) => n.Router.go(v), view);
      await expect(page.locator(".page-title")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${view} sin scroll lateral`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("carga un gasto con decimales y lo guarda en la cuenta", async ({ context }) => {
  const store = new Map();
  const { page } = await open(context, store);
  await addExpense(page, { amount: "1.234,50", description: "Librería" });
  const saved = await app(page, n => n.Store.state.expenses.find(e => e.description === "Librería").amount);
  expect(saved).toBe(1234.5);
  await expect.poll(() => [...store.values()].some(v => v.includes("Librería"))).toBe(true);
});

test("un gasto en 12 cuotas registra la primera y programa el resto", async ({ context }) => {
  const { page } = await open(context, new Map());
  await addExpense(page, { amount: "240000", description: "Celular", cuotas: 12 });
  const plan = await app(page, n => n.Store.state.installments.find(p => p.description === "Celular"));
  expect(plan).toMatchObject({ amount: 20000, count: 12, done: 1, paymentMethod: "Tarjeta de crédito" });
  await app(page, n => n.Router.go("cuotas"));
  await expect(page.getByRole("button", { name: /Celular 1\/12/ })).toBeVisible();
});

test("lo que cargás en un dispositivo aparece en el otro", async ({ browser }) => {
  const store = new Map();
  const a = await browser.newContext(), b = await browser.newContext();
  const { page: one } = await open(a, store);
  await addExpense(one, { amount: "5000", description: "Desde el celular" });
  await expect.poll(() => [...store.values()].some(v => v.includes("Desde el celular"))).toBe(true);
  const { page: two } = await open(b, store);
  expect(await app(two, n => n.Store.state.expenses.some(e => e.description === "Desde el celular"))).toBe(true);
  await a.close(); await b.close();
});

test("gastos compartidos: divide, calcula quién le paga a quién y arma el resumen", async ({ context }) => {
  const { page } = await open(context, new Map());
  await app(page, n => n.Router.go("compartidos"));
  await page.getByRole("button", { name: "Nuevo" }).click();
  await page.fill('input[name="name"]', "Viaje a Bariloche");
  await page.fill('input[name="person-0"]', "Mateo");
  await page.fill('input[name="more"]', "Sofía, Martín");
  await page.locator('.modal button[type="submit"]').click();
  // Se abre solo el primer gasto
  await page.fill('input[name="description"]', "Alojamiento");
  await page.fill('input[name="amount"]', "90000");
  await page.locator('.modal button[type="submit"]').click();
  await expect(page.getByText("Sofía → Mateo")).toBeVisible();
  await expect(page.getByText("Martín → Mateo")).toBeVisible();
  // Sin portapapeles, el resumen se muestra para copiar a mano
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("sin portapapeles")); });
  await page.getByRole("button", { name: "Mandar al grupo" }).click();
  await expect(page.locator("#share-text")).toHaveValue(/Sofía le pasa \$\s?30\.000 a Mateo/);
});

test("cambia al tema claro desde Ajustes y lo recuerda", async ({ context }) => {
  const { page } = await open(context, new Map());
  await app(page, n => n.Router.go("ajustes"));
  await page.selectOption("#set-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-numo-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-numo-theme", "light");
});
