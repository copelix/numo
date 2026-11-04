import { html } from "../lib/html.js";
import { UI } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { MonthChart } from "../ui/month-chart.js";

import { PartsViews } from "./parts.js";
import { InicioViews } from "./inicio.js";
import { MovimientosViews } from "./movimientos.js";
import { SuscripcionesViews } from "./suscripciones.js";
import { InformesViews } from "./informes.js";
import { MasViews } from "./mas.js";
import { PagosViews } from "./pagos.js";
import { PlanearViews } from "./planear.js";
import { CuotasViews } from "./cuotas.js";
import { CompartidosViews } from "./compartidos.js";
import { InflacionViews } from "./inflacion.js";

/** Encabezado de las páginas que viven dentro de "Más", con el botón para volver. */
export function subHead({ title, subtitle, actions, back = ["mas", "Más"] }) {
  return html`<a class="back-link" href="#/${back[0]}">${icon("left", 16)}${back[1]}</a>${UI.pageHead({ title, subtitle, actions })}`;
}
export const Views = {
  ...PartsViews,
  ...InicioViews,
  ...MovimientosViews,
  ...SuscripcionesViews,
  ...InformesViews,
  ...MasViews,
  ...PagosViews,
  ...PlanearViews,
  ...CuotasViews,
  ...CompartidosViews,
  ...InflacionViews,
};

/** Lo que hay que hacer después de dibujar cada vista. */
export const AfterRender = {
  inicio: () => MonthChart.render(),
  movimientos: () => Views.renderExpenseResults(),
};
