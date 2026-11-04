/* Capturas de todas las vistas en los dos temas (para comparar antes/después de un cambio de estilos).
   Uso: node tools/shots.mjs <url> <carpeta> */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const MOCK = `(() => { const store = {}; window.claude = { use: async name => {
  if (name === 'db') return { doc: path => ({ async get() { const v = store[path]; return { exists: v !== undefined, data: () => v && JSON.parse(v), metadata: { hasPendingWrites: false } }; },
    async set(d) { store[path] = JSON.stringify(d); }, async delete() { delete store[path]; }, onSnapshot() { return () => {}; } }) };
  if (name === 'user') return { id: async () => 'u_shots' };
  return null; } }; })();`;
const VIEWS = ["inicio", "movimientos", "suscripciones", "informes", "mas", "cuotas", "compartidos", "compartido", "inflacion", "pagos", "planear", "ajustes", "cambio", "datos", "cuenta", "categorias"];
const b = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", colorScheme: theme });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(MOCK);
  const pg = await ctx.newPage();
  await pg.goto(url); await pg.waitForTimeout(1500);
  const N = await pg.evaluate(() => !!window.__numo);
  await pg.addStyleTag({ content: "*{caret-color:transparent!important} .toast{display:none!important}" });
  for (const v of VIEWS) {
    // La versión de un solo archivo no expone window.__numo: sus objetos son globales del script
    const n = N ? "window.__numo." : "";
    await pg.evaluate(`${v === "compartido" ? `${n}UIState.sharedId = ${n}Store.state.shared[0].id;` : ""} ${n}Router.go(${JSON.stringify(v)}); window.scrollTo(0, 0);`);
    await pg.waitForTimeout(250);
    await pg.screenshot({ path: `${out}/${theme}-${v}.png`, fullPage: true });
  }
  await ctx.close();
}
await b.close();
console.log("listo", out);
