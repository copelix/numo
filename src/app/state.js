/* =========================================================================
   11. VISTAS
   ========================================================================= */
export const UIState = {
  calendarOffset: 0,
  reportMonths: 6,
  movementType: "todo", // todo | gastos | ingresos
  filters: { q: "", categoryId: "", from: "", to: "" },
  expenseLimit: 60,
  homeOffset: 0, // mes que se ve en el Inicio: 0 = actual, -1 = anterior…
  inflationBack: 12, // Informes: comparar con hace 1, 6 o 12 meses
  sharedId: null, // gasto compartido abierto
};
