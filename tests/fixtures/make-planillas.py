"""Arma las planillas de prueba del importador de Excel.

Uso (desde la raíz del proyecto): python3 tests/fixtures/make-planillas.py
Necesita openpyxl. Si está LibreOffice, además guarda una copia re-grabada por LibreOffice
(con los totales calculados y otro estilo de XML), como las que arma un cliente real.
"""
import datetime as dt
import pathlib
import shutil
import subprocess
import tempfile

from openpyxl import Workbook

HERE = pathlib.Path(__file__).parent
wb = Workbook()

# Hoja 1: como la arma mucha gente. Título arriba, encabezados con acentos, fechas reales,
# montos con formato de pesos, una fila vacía y un total al final.
gastos = wb.active
gastos.title = "Gastos 2024"
gastos.append(["Mis gastos 2024"])
gastos.append([])
gastos.append(["Fecha", "Concepto", "Categoría", "Importe", "Medio de pago"])
rows = [
    (dt.date(2024, 1, 5), "Supermercado Coto", "Comida", 45230.5, "Débito"),
    (dt.date(2024, 1, 12), "Nafta", "Transporte", 30000, "Tarjeta de crédito"),
    (dt.date(2024, 2, 3), "Farmacia", "Salud", 12800, "Efectivo"),
    None,
    (dt.date(2024, 2, 20), "Cena con amigos", "Salidas", 38000, "Mercado Pago"),
    (dt.date(2024, 3, 1), "Alquiler", "Casa", 350000, "Transferencia"),
]
for r in rows:
    gastos.append(list(r) if r else [])
gastos.append(["", "Total", "", "=SUM(D4:D9)", ""])
for row in gastos.iter_rows(min_row=4, max_row=9):
    row[0].number_format = "dd/mm/yyyy"
    row[3].number_format = '"$" #,##0.00'

# Hoja 2: ingresos y gastos en columnas separadas, fechas escritas como texto
caja = wb.create_sheet("Caja 2025")
caja.append(["Día", "Detalle", "Ingresos", "Gastos"])
caja.append(["15/01/2025", "Sueldo enero", 950000, None])
caja.append(["16/01/2025", "Expensas", None, 98000])
caja.append(["3/2/25", "Venta bicicleta", 120000, None])
caja.append(["10/02/2025", "Netflix", None, 9999])

out = HERE / "planilla.xlsx"
wb.save(out)
print("guardada", out)

soffice = shutil.which("soffice") or shutil.which("libreoffice")
if soffice:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [soffice, "--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", tmp, str(out)],
            check=True,
            capture_output=True,
        )
        shutil.copy(pathlib.Path(tmp) / "planilla.xlsx", HERE / "planilla-libreoffice.xlsx")
        print("guardada", HERE / "planilla-libreoffice.xlsx")
