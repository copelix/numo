/* Ayudantes de las pruebas: la base de Claude y un Supabase simulados, sin salir a internet. */
import { expect } from "@playwright/test";

/** Ejecuta una función contra los módulos de la app (window.__numo) dentro de la página.
    Se manda como texto (y no con new Function) para no chocar con la política de seguridad de la página. */
export const app = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__numo, ${JSON.stringify(arg ?? null)})`);

/** Corta las tipografías de Google (no hay internet en las pruebas) y junta los errores de la página. */
export async function watchErrors(page) {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => {
    const t = m.text();
    if (/Content Security Policy|Refused to/.test(t)) errors.push(t);
    else if (m.type() === "error" && !/fonts\.g|ERR_|net::|status of 40\d/.test(t)) errors.push(t);
  });
  await page.context().route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return errors;
}

/** Base de datos de Claude ("db" y "user") compartida entre páginas, como dos dispositivos de la misma persona. */
export async function mockClaude(context, store, userId = "u_test") {
  await context.exposeFunction("__dbGet", path => store.get(path) ?? null);
  await context.exposeFunction("__dbSet", (path, value) => { store.set(path, value); });
  await context.exposeFunction("__dbDel", path => { store.delete(path); });
  await context.addInitScript(id => {
    window.claude = { use: async name => {
      if (name === "db") return { doc: path => ({
        async get() { const v = await window.__dbGet(path); return { exists: v !== null, data: () => (v === null ? undefined : JSON.parse(v)), metadata: { hasPendingWrites: false } }; },
        async set(d) { await window.__dbSet(path, JSON.stringify(d)); },
        async delete() { await window.__dbDel(path); },
        onSnapshot() { return () => {}; },
      }) };
      if (name === "user") return { id: async () => id };
      return null;
    } };
  }, userId);
}

const SUPABASE = "https://numo-e2e.supabase.co";

/** Supabase simulado: auth con mail y contraseña + tabla numo_docs donde cada usuario ve solo lo suyo. */
export function fakeSupabase({ expiresIn = 3600 } = {}) {
  const db = { users: new Map(), tokens: new Map(), refresh: new Map(), rows: new Map(), refreshCount: 0 };
  const session = (id, email) => {
    const access = `at_${Math.random().toString(36).slice(2)}`;
    const refresh = `rt_${Math.random().toString(36).slice(2)}`;
    db.tokens.set(access, { id, exp: Date.now() + expiresIn * 1000 });
    db.refresh.set(refresh, id);
    return { access_token: access, refresh_token: refresh, expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn, user: { id, email } };
  };
  const reply = (route, status, body) => route.fulfill({
    status, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: body === undefined ? "" : JSON.stringify(body),
  });

  async function handle(route) {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (!req.headers().apikey) return reply(route, 401, { message: "Falta la apikey" });

    if (url.pathname === "/auth/v1/signup") {
      if (db.users.has(body.email)) return reply(route, 422, { error_code: "user_already_exists", msg: "User already registered" });
      if (body.password.length < 8) return reply(route, 422, { error_code: "weak_password", msg: "weak" });
      const id = `u_${db.users.size + 1}`;
      db.users.set(body.email, { id, password: body.password });
      return reply(route, 200, session(id, body.email));
    }
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "password") {
        const user = db.users.get(body.email);
        if (!user || user.password !== body.password) return reply(route, 400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return reply(route, 200, session(user.id, body.email));
      }
      const id = db.refresh.get(body.refresh_token);
      if (!id) return reply(route, 400, { error_code: "refresh_token_not_found" });
      db.refresh.delete(body.refresh_token);
      db.refreshCount++;
      const email = [...db.users].find(([, u]) => u.id === id)[0];
      return reply(route, 200, session(id, email));
    }
    if (url.pathname === "/auth/v1/logout") return reply(route, 204);

    const token = db.tokens.get((req.headers().authorization ?? "").replace("Bearer ", ""));
    if (!token || token.exp < Date.now()) return reply(route, 401, { message: "JWT expired" });
    const uid = token.id;

    if (url.pathname === "/rest/v1/rpc/delete_my_account") {
      for (const key of [...db.rows.keys()]) if (key.startsWith(`${uid}|`)) db.rows.delete(key);
      for (const [email, u] of db.users) if (u.id === uid) db.users.delete(email);
      return reply(route, 204);
    }
    if (url.pathname === "/rest/v1/numo_docs") {
      const doc = url.searchParams.get("doc")?.replace("eq.", "");
      const mine = [...db.rows].filter(([key]) => key.startsWith(`${uid}|`) && (!doc || key === `${uid}|${doc}`));
      if (req.method() === "GET") {
        const onlyMeta = url.searchParams.get("select") !== "data";
        return reply(route, 200, mine.map(([, data]) => (onlyMeta ? { meta: data.meta } : { data })));
      }
      if (req.method() === "POST") {
        if (body.user_id !== uid) return reply(route, 403, { message: "new row violates row-level security policy" });
        db.rows.set(`${uid}|${body.doc}`, body.data);
        return reply(route, 201);
      }
      if (req.method() === "DELETE") {
        for (const [key] of mine) db.rows.delete(key);
        return reply(route, 204);
      }
    }
    return reply(route, 404, { message: "no encontrado" });
  }

  return {
    db,
    revokeAll() { db.tokens.clear(); db.refresh.clear(); },
    async attach(context) {
      await context.route(`${SUPABASE}/**`, handle);
      await context.route("**/config.js", r => r.fulfill({
        contentType: "text/javascript",
        body: `window.NUMO_CONFIG = { supabaseUrl: "${SUPABASE}", supabaseKey: "sb_publishable_pruebas_e2e_0123456789" };`,
      }));
    },
  };
}

/** Carga un gasto desde el botón "+" de arriba. */
export async function addExpense(page, { amount, description, cuotas }) {
  await page.locator("#topbar-add").click();
  await page.locator('[data-modal-value="expense"]').click();
  await page.fill('input[name="amount"]', amount);
  await page.fill('input[name="description"]', description);
  if (cuotas) await page.selectOption('select[name="cuotas"]', String(cuotas));
  await page.locator('.modal button[type="submit"]').click();
  await expect(page.locator("#modal")).not.toBeVisible();
}
