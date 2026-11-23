/* La app dentro de Claude: guarda en la cuenta de Claude (simulada) y sincroniza entre dispositivos. */
import { expect, test } from "@playwright/test";
import { addExpense, app, mockClaude, watchErrors } from "./helpers.js";

const VIEWS = [
  "inicio",
  "movimientos",
  "suscripciones",
  "informes",
  "mas",
  "cuotas",
  "compartidos",
  "inflacion",
  "pagos",
  "planear",
  "ajustes",
  "cambio",
  "datos",
  "cuenta",
  "categorias",
];

async function open(context, store) {
  await mockClaude(context, store);
  const page = await context.newPage();
  const errors = await watchErrors(page);
  await page.goto("/");
  await expect.poll(() => app(page, n => `${n.Sync.mode}/${n.Sync.status}`)).toBe("cloud/synced");
  return { page, errors };
}

test("abre y recorre todas las vistas en los dos temas, sin errores ni desbordes", async ({ context }) => {
  const { page, errors } = await open(context, new Map());
  for (const theme of ["dark", "light"]) {
    await app(
      page,
      (n, t) =>
        n.Store.commit(s => {
          s.settings.theme = t;
        }),
      theme,
    );
    await expect(page.locator("html")).toHaveAttribute("data-numo-theme", theme);
    for (const view of VIEWS) {
      await app(page, (n, v) => n.Router.go(v), view);
      await expect(page.locator(".page-title")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${theme}/${view} sin scroll lateral`,
      ).toBe(true);
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
  const a = await browser.newContext(),
    b = await browser.newContext();
  const { page: one } = await open(a, store);
  await addExpense(one, { amount: "5000", description: "Desde el celular" });
  await expect.poll(() => [...store.values()].some(v => v.includes("Desde el celular"))).toBe(true);
  const { page: two } = await open(b, store);
  expect(await app(two, n => n.Store.state.expenses.some(e => e.description === "Desde el celular"))).toBe(true);
  await a.close();
  await b.close();
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
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("sin portapapeles"));
  });
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

test("deslizar un gasto para borrarlo pregunta antes de eliminarlo", async ({ context }) => {
  const { page } = await open(context, new Map());
  await addExpense(page, { amount: "5000", description: "Kiosco" });
  await app(page, n => n.Router.go("movimientos"));
  const row = page.getByRole("button", { name: /Kiosco/ }).first();
  const swipeLeft = async () => {
    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 80, y, { steps: 4 });
    await page.mouse.move(box.x + box.width - 160, y, { steps: 4 });
    await page.mouse.up();
  };
  const count = () => app(page, n => n.Store.state.expenses.filter(e => e.description === "Kiosco").length);

  await swipeLeft();
  await expect(page.getByRole("heading", { name: "¿Eliminar este gasto?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(await count()).toBe(1);

  await swipeLeft();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  expect(await count()).toBe(0);
});

test("un gasto en dólares no suma el impuesto de la tarjeta salvo que elijas pagar con tarjeta", async ({
  context,
}) => {
  const { page } = await open(context, new Map());
  await app(page, n => n.Forms.expense());
  await page.selectOption('select[name="currency"]', "USD");
  const tax = page.locator('input[name="cardTax"]');
  await expect(tax).toBeVisible();
  await expect(tax).not.toBeChecked();
  await page.getByText("Más opciones").click();
  const method = page.locator('select[name="paymentMethod"]');
  await expect(method.locator("option")).toContainText(["Efectivo", "Tarjeta de crédito", "Billetera virtual"]);
  await method.selectOption("Tarjeta de crédito");
  await expect(tax).toBeChecked();
  await method.selectOption("Efectivo");
  await expect(tax).not.toBeChecked();
});

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

/** Abre Próximos pagos con una suscripción, haciéndose pasar por el celular que se indique. */
async function openPagos(browser, userAgent) {
  const context = await browser.newContext({ userAgent });
  const { page, errors } = await open(context, new Map());
  await app(page, n =>
    n.Store.commit(state => {
      state.subscriptions.push(
        n.Schema.subscription(
          {
            id: "s-cal",
            name: "Spotify",
            amount: 4500,
            currency: "ARS",
            frequency: "mensual",
            nextDate: n.Dates.today(),
          },
          { ids: new Set(state.categories.map(c => c.id)), fallback: n.Finance.defaultCategoryId() },
        ),
      );
    }),
  );
  await app(page, n => n.Router.go("pagos"));
  return {
    context,
    page,
    errors,
    button: page.locator('[data-id="s-cal"]').filter({ hasText: "Agregar al calendario" }),
  };
}

test("en el iPhone, agregar al calendario baja un .ics para Calendario de Apple", async ({ browser }) => {
  const { context, page, errors, button } = await openPagos(browser, IPHONE);
  await expect(button).toHaveCount(1);
  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("spotify.ics");
  const text = await (await file.createReadStream()).toArray().then(c => Buffer.concat(c).toString("utf8"));
  expect(text).toContain("SUMMARY:Pago de Spotify");
  await expect(page.locator('[data-id="s-cal"]').filter({ hasText: "Agregado" })).toHaveCount(1);
  expect(errors).toEqual([]);
  await context.close();
});

test("en Android, agregar al calendario abre Google Calendar", async ({ browser }) => {
  const { context, button } = await openPagos(browser, ANDROID);
  await expect(button).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/render\?.*Spotify/);
  await context.close();
});

test("importa una planilla de Excel propia, se puede deshacer y no duplica al reimportar", async ({ context }) => {
  const { page, errors } = await open(context, new Map());
  const file = "tests/fixtures/planilla-libreoffice.xlsx";
  const count = () => app(page, n => [n.Store.state.expenses.length, n.Store.state.incomes.length]);
  const [expenses0, incomes0] = await count();

  await app(page, n => n.Router.go("datos"));
  await page.locator("#import-file").setInputFiles(file);
  const modal = page.locator("#modal");
  await expect(modal.getByRole("heading", { name: "Importar desde Excel" })).toBeVisible();
  await expect(modal.locator('select[name="col-date"]')).toHaveValue("Fecha");
  await expect(modal.locator('select[name="col-amount"]')).toHaveValue("Importe");
  await expect(modal.locator("[data-import-preview]")).toContainText("7 gastos y 2 ingresos");

  // Solo la primera hoja
  await modal.getByLabel("Caja 2025").uncheck();
  await expect(modal.locator("[data-import-preview]")).toContainText("5 gastos y 0 ingresos");
  await modal.getByLabel("Caja 2025").check();
  await modal.getByRole("button", { name: "Importar 9" }).click();
  await expect(modal).not.toBeVisible();
  expect(await count()).toEqual([expenses0 + 7, incomes0 + 2]);
  expect(await app(page, n => n.Store.state.categories.some(c => c.name === "Salidas"))).toBe(true);

  // Deshacer
  await page.locator(".toast").getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(count).toEqual([expenses0, incomes0]);

  // Importar dos veces: la segunda no repite nada
  await page.locator("#import-file").setInputFiles(file);
  await modal.getByRole("button", { name: "Importar 9" }).click();
  await page.locator("#import-file").setInputFiles(file);
  await expect(modal.locator("[data-import-preview]")).toContainText("9 ya estaban cargadas");
  await expect(modal.locator('button[type="submit"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test("un CSV propio también abre el asistente de importación", async ({ context }) => {
  const { page } = await open(context, new Map());
  await app(page, n => n.Router.go("datos"));
  await page.locator("#import-file").setInputFiles({
    name: "banco.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Fecha;Descripción;Monto\n01/03/2024;Sueldo;1.000.000\n02/03/2024;Luz;-25.000,50\n"),
  });
  const preview = page.locator("[data-import-preview]");
  await expect(preview).toContainText("1 gasto y 1 ingreso");
  await expect(preview).toContainText("Los montos negativos entran como gastos");
});

test("exporta a Excel eligiendo período y qué incluir, y baja la copia de seguridad", async ({ context }) => {
  const { page, errors } = await open(context, new Map());
  await app(page, n => n.Store.commit(s => n.Demo.add(s)));
  await app(page, n => n.Router.go("datos"));

  // Planilla de Excel
  await page.getByRole("button", { name: /Planilla de Excel/ }).click();
  const modal = page.locator("#modal");
  await expect(modal.getByRole("heading", { name: "Exportar a Excel" })).toBeVisible();
  await expect(modal.locator('input[name="period"][value="year"]')).toBeChecked();
  const summary = modal.locator("[data-summary]");
  await expect(summary).toContainText(/numo-\d{4}-01-01-a-\d{4}-\d{2}-\d{2}\.xlsx/);
  await expect(summary).toContainText("Hojas: Resumen por mes, Gastos");

  await modal.getByRole("radio", { name: "Todo" }).check();
  await expect(summary).toContainText(/numo-\d{4}-\d{2}-\d{2}\.xlsx/);
  await modal.getByLabel("Cuotas").uncheck();
  await expect(summary).not.toContainText("Cuotas");

  // Fechas a mano, mal elegidas: no deja descargar
  await modal.getByRole("radio", { name: "Elegir fechas" }).check();
  await modal.locator('input[name="from"]').fill("2030-01-01");
  await expect(summary).toContainText("tiene que ser anterior");
  await expect(modal.locator('button[type="submit"]')).toBeDisabled();
  await modal.getByRole("radio", { name: "Todo" }).check();

  const download = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Descargar" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^numo-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = Buffer.concat(await (await file.createReadStream()).toArray());
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  const text = bytes.toString("utf8");
  for (const sheet of ["Resumen", "Gastos", "Ingresos", "Suscripciones"]) expect(text).toContain(`name="${sheet}"`);
  expect(text).not.toContain('name="Cuotas"');
  if (process.env.NUMO_SAVE_EXPORT) await file.saveAs(process.env.NUMO_SAVE_EXPORT);
  await expect(page.locator(".toast")).toContainText("Se descargó");

  // Copia de seguridad
  await page.getByRole("button", { name: /Copia de seguridad/ }).click();
  await expect(modal).toContainText(/numo-copia-\d{4}-\d{2}-\d{2}\.json/);
  await expect(modal).toContainText("Todavía no bajaste ninguna copia");
  const backup = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Descargar copia" }).click();
  const json = JSON.parse(Buffer.concat(await (await (await backup).createReadStream()).toArray()).toString("utf8"));
  expect(json.expenses.length).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /Copia de seguridad/ })).toContainText("Última: hoy");
  expect(errors).toEqual([]);
});

test("trae sola la inflación del INDEC y la muestra como oficial", async ({ context }) => {
  const { page, errors } = await open(context, new Map());
  await expect.poll(() => app(page, n => n.Store.state.settings.ipcOfficial["2030-02"])).toBe(3.1);
  expect(await app(page, n => n.Inflation.rate("2030-01"))).toBe(2.5);
  await app(page, n => n.Router.go("inflacion"));
  await expect(page.getByText("Los datos se actualizan solos desde el INDEC")).toBeVisible();
  expect(errors).toEqual([]);
});

test("programa un aumento de un ingreso fijo para los próximos cobros", async ({ context }) => {
  const { page, errors } = await open(context, new Map());
  await app(page, n =>
    n.Store.commit(state => {
      state.incomes.push(
        n.Schema.income({
          id: "fijo",
          description: "Mensualidad",
          amount: 100000,
          currency: "ARS",
          date: n.Dates.addMonths(n.Dates.today(), -2, 1),
          sourceId: "sueldo",
          recurring: true,
        }),
      );
      n.Finance.settle();
    }),
  );
  const generated = await app(page, n => n.Store.state.incomes.filter(i => i.templateId === "fijo").length);
  expect(generated).toBe(2);

  // Desde un cobro automático se llega al ingreso fijo
  await app(page, n => n.Forms.income(n.Store.state.incomes.find(i => i.templateId === "fijo").id));
  const modal = page.locator("#modal");
  await modal.getByRole("button", { name: "Cambiar el monto de los próximos meses" }).click();
  await expect(modal.getByRole("heading", { name: "Editar ingreso" })).toBeVisible();

  await modal.getByLabel("Me lo van a aumentar").check();
  await modal.getByRole("button", { name: "+10%" }).click();
  await expect(modal.locator('input[name="raiseAmount"]')).toHaveValue("110000");
  await expect(modal.locator("[data-raise-hint]")).toContainText("(+10%)");
  await modal.locator('button[type="submit"]').click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator(".toast")).toContainText("vas a cobrar $ 110.000");

  const t = await app(page, n => {
    const t = n.Store.state.incomes.find(i => i.id === "fijo");
    return { raises: t.raises, amount: t.amount, next: n.Finance.nextRecurringDate(t, n.Store.state.incomes) };
  });
  expect(t.amount).toBe(100000);
  expect(t.raises).toEqual([{ from: t.next, amount: 110000 }]);

  // Desmarcar quita el aumento pendiente
  await app(page, n => n.Forms.income("fijo"));
  await expect(modal.getByLabel("Me lo van a aumentar")).toBeChecked();
  await modal.getByLabel("Me lo van a aumentar").uncheck();
  await modal.locator('button[type="submit"]').click();
  expect(await app(page, n => n.Store.state.incomes.find(i => i.id === "fijo").raises)).toBeUndefined();
  expect(errors).toEqual([]);
});
