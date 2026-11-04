/* La versión web publicada: sin Claude, con cuentas propias (Supabase simulado), cabeceras de seguridad y sin conexión. */
import { expect, test } from "@playwright/test";
import { addExpense, app, fakeSupabase, watchErrors } from "./helpers.js";

async function open(context, supabase) {
  if (supabase) await supabase.attach(context);
  const page = await context.newPage();
  const errors = await watchErrors(page);
  await page.goto("/");
  await expect.poll(() => app(page, n => n.Sync.mode)).not.toBe("connecting");
  return { page, errors };
}

async function signUp(page, email, password, button = "auth-signup") {
  await app(page, (n, b) => n.Actions[b](), button);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator('.modal button[type="submit"]').click();
}

test("manda las cabeceras de seguridad y no las rompe", async ({ page, request }) => {
  const errors = await watchErrors(page);
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("script-src 'self'");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  await page.goto("/");
  await expect(page.locator(".page-title")).toBeVisible();
  expect(errors).toEqual([]);
});

test("sin cuenta guarda en el navegador y abre sin conexión", async ({ context }) => {
  const { page } = await open(context);
  expect(await app(page, n => n.Sync.mode)).toBe("local");
  await addExpense(page, { amount: "4321", description: "Sin cuenta" });
  expect(await page.evaluate(() => localStorage.getItem("cuentas-claras:cache"))).toContain("Sin cuenta");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                             // la segunda carga ya queda guardada
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".nav--tabbar")).toBeVisible();
  expect(await app(page, n => n.Store.state.expenses.some(e => e.description === "Sin cuenta"))).toBe(true);
  await context.setOffline(false);
});

test("crear cuenta, entrar en otro dispositivo y ver lo mismo", async ({ browser }) => {
  const supabase = fakeSupabase();
  const a = await browser.newContext(), b = await browser.newContext();
  const { page: one } = await open(a, supabase);
  await app(one, n => n.Store.commit(s => n.Demo.remove(s)));
  await addExpense(one, { amount: "1500", description: "Antes de la cuenta" });
  await signUp(one, "mateo@ejemplo.com", "clave-segura-1");
  await expect.poll(() => app(one, n => `${n.Sync.provider}/${n.Sync.status}`)).toBe("numo/synced");
  expect(JSON.stringify([...supabase.db.rows.values()])).toContain("Antes de la cuenta");

  const { page: two } = await open(b, supabase);
  await signUp(two, "mateo@ejemplo.com", "clave-segura-1");
  await expect(two.locator("[data-auth-error]")).toHaveText(/ya tiene cuenta/);
  await two.getByRole("button", { name: "Ya tengo cuenta" }).click();
  await two.fill('input[name="email"]', "mateo@ejemplo.com");
  await two.fill('input[name="password"]', "otra-clave");
  await two.locator('.modal button[type="submit"]').click();
  await expect(two.locator("[data-auth-error]")).toHaveText(/no coinciden/);
  await two.fill('input[name="password"]', "clave-segura-1");
  await two.locator('.modal button[type="submit"]').click();
  await expect.poll(() => app(two, n => n.Store.state.expenses.some(e => e.description === "Antes de la cuenta"))).toBe(true);

  await addExpense(two, { amount: "800", description: "Desde la compu" });
  await expect.poll(() => JSON.stringify([...supabase.db.rows.values()]).includes("Desde la compu")).toBe(true);
  await one.evaluate(() => dispatchEvent(new Event("focus")));
  await expect.poll(() => app(one, n => n.Store.state.expenses.some(e => e.description === "Desde la compu"))).toBe(true);
  await a.close(); await b.close();
});

test("renueva la sesión sola y, si se cae, sigue guardando en el navegador", async ({ context }) => {
  const supabase = fakeSupabase({ expiresIn: 62 });   // vence enseguida: se renueva 60 s antes
  const { page } = await open(context, supabase);
  await signUp(page, "ana@ejemplo.com", "clave-segura-2");
  await expect.poll(() => app(page, n => n.Sync.status)).toBe("synced");
  await page.waitForTimeout(2500);
  await addExpense(page, { amount: "100", description: "Tras renovar" });
  await expect.poll(() => supabase.db.refreshCount).toBeGreaterThan(0);
  await expect.poll(() => app(page, n => n.Sync.status)).toBe("synced");

  supabase.revokeAll();
  await addExpense(page, { amount: "200", description: "Sin sesión" });
  await expect.poll(() => app(page, n => n.Sync.mode)).toBe("local");
  await expect(page.locator(".toast")).toContainText("Tu sesión se cerró");
  expect(await page.evaluate(() => localStorage.getItem("cuentas-claras:cache"))).toContain("Sin sesión");
});

test("borrar la cuenta elimina los datos de la nube", async ({ context }) => {
  const supabase = fakeSupabase();
  const { page } = await open(context, supabase);
  await signUp(page, "leo@ejemplo.com", "clave-segura-3");
  await expect.poll(() => supabase.db.rows.size).toBeGreaterThan(0);
  await app(page, n => n.Router.go("cuenta"));
  await page.getByRole("button", { name: "Borrar mi cuenta y mis datos" }).click();
  await page.locator('[data-modal-value="ok"]').click();
  await expect.poll(() => supabase.db.rows.size).toBe(0);
  expect(supabase.db.users.size).toBe(0);
  await expect.poll(() => app(page, n => n.Sync.mode)).toBe("local");
});
