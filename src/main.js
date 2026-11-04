import * as appActions from "./app/actions.js";
import * as appApp from "./app/app.js";
import * as appEvents from "./app/events.js";
import * as appRouter from "./app/router.js";
import * as appState from "./app/state.js";
import * as config from "./config.js";
import * as coreDemo from "./core/demo.js";
import * as coreFinance from "./core/finance.js";
import * as coreInflation from "./core/inflation.js";
import * as coreMoney from "./core/money.js";
import * as coreSchema from "./core/schema.js";
import * as coreShared from "./core/shared.js";
import * as coreStore from "./core/store.js";
import * as coreTransfer from "./core/transfer.js";
import * as formsAuth from "./forms/auth.js";
import * as formsIndex from "./forms/index.js";
import * as formsInstallment from "./forms/installment.js";
import * as formsMovements from "./forms/movements.js";
import * as formsPlanning from "./forms/planning.js";
import * as formsShared from "./forms/shared.js";
import * as formsSubscription from "./forms/subscription.js";
import * as libDates from "./lib/dates.js";
import * as libHtml from "./lib/html.js";
import * as libStorage from "./lib/storage.js";
import * as libUtils from "./lib/utils.js";
import * as syncBackup from "./sync/backup.js";
import * as syncCloud from "./sync/cloud.js";
import * as syncSync from "./sync/sync.js";
import * as uiCalendar from "./ui/calendar.js";
import * as uiCharts from "./ui/charts.js";
import * as uiComponents from "./ui/components.js";
import * as uiFields from "./ui/fields.js";
import * as uiGestures from "./ui/gestures.js";
import * as uiIcons from "./ui/icons.js";
import * as uiModal from "./ui/modal.js";
import * as uiMonthChart from "./ui/month-chart.js";
import * as uiMotion from "./ui/motion.js";
import * as uiQuickEntry from "./ui/quick-entry.js";
import * as uiTheme from "./ui/theme.js";
import * as uiToast from "./ui/toast.js";
import * as viewsCompartidos from "./views/compartidos.js";
import * as viewsCuotas from "./views/cuotas.js";
import * as viewsIndex from "./views/index.js";
import * as viewsInflacion from "./views/inflacion.js";
import * as viewsInformes from "./views/informes.js";
import * as viewsInicio from "./views/inicio.js";
import * as viewsMas from "./views/mas.js";
import * as viewsMovimientos from "./views/movimientos.js";
import * as viewsPagos from "./views/pagos.js";
import * as viewsParts from "./views/parts.js";
import * as viewsPlanear from "./views/planear.js";
import * as viewsSuscripciones from "./views/suscripciones.js";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/navigation.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/theme-light.css";
import { App } from "./app/app.js";
import { bindEvents } from "./app/events.js";
import { Schema } from "./core/schema.js";
import { Store } from "./core/store.js";
import { Persist } from "./sync/backup.js";
import { Sync } from "./sync/sync.js";
import { Theme } from "./ui/theme.js";

export async function boot() {
  Theme.apply();
  Theme.media.addEventListener?.("change", () => Theme.apply());
  bindEvents();
  // 1) Pintar enseguida: la copia de este navegador si existe; si no, "Cargando…"
  const cache = Store.readCache();
  if (cache) Store.state = Schema.normalize(cache.state);
  App.render();
  // 2) Conectar con la cuenta de Claude; sin cuenta, queda guardado en este navegador
  if (await Sync.connect()) await Sync.start(cache);
  else Sync.startLocal(cache);
  if (typeof window.claude?.use !== "function") Persist.ask();
}

/* Acceso para las pruebas automáticas y la consola: window.__numo.Store, etc. */
window.__numo = Object.assign(
  {},
  appActions,
  appApp,
  appEvents,
  appRouter,
  appState,
  config,
  coreDemo,
  coreFinance,
  coreInflation,
  coreMoney,
  coreSchema,
  coreShared,
  coreStore,
  coreTransfer,
  formsAuth,
  formsIndex,
  formsInstallment,
  formsMovements,
  formsPlanning,
  formsShared,
  formsSubscription,
  libDates,
  libHtml,
  libStorage,
  libUtils,
  syncBackup,
  syncCloud,
  syncSync,
  uiCalendar,
  uiCharts,
  uiComponents,
  uiFields,
  uiGestures,
  uiIcons,
  uiModal,
  uiMonthChart,
  uiMotion,
  uiQuickEntry,
  uiTheme,
  uiToast,
  viewsCompartidos,
  viewsCuotas,
  viewsIndex,
  viewsInflacion,
  viewsInformes,
  viewsInicio,
  viewsMas,
  viewsMovimientos,
  viewsPagos,
  viewsParts,
  viewsPlanear,
  viewsSuscripciones,
);

boot();

/* App instalable y sin conexión: solo en la web publicada (no dentro de Claude). */
if (
  import.meta.env.MODE !== "artifact" &&
  "serviceWorker" in navigator &&
  typeof window.claude?.use !== "function" &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
