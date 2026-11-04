import { chromium } from "@playwright/test";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage(); const errs = [];
pg.on("pageerror", e => errs.push(String(e.stack || e).slice(0, 400)));
pg.on("console", m => { if (m.type() === "error" && !/fonts|ERR_|net::/.test(m.text())) errs.push(m.text()); });
await pg.goto(process.argv[2] || "http://localhost:4173/"); await pg.waitForTimeout(1500);
const r = await pg.evaluate(() => { const n = window.__numo; return n && n.Store.state ? { version: n.CONFIG.version, modo: n.Sync.mode, vistas: Object.keys(n.Views).length, gastos: n.Store.state.expenses.length, tema: document.documentElement.dataset.numoTheme } : { numo: !!n }; });
if (r.version) for (const v of ["inicio","movimientos","suscripciones","informes","mas","cuotas","compartidos","inflacion","pagos","planear","ajustes","cambio","datos","cuenta","categorias"]) {
  await pg.evaluate(v => window.__numo.Router.go(v), v); await pg.waitForTimeout(120);
}
console.log(JSON.stringify(r), errs.length ? errs : "sin errores"); await b.close();
