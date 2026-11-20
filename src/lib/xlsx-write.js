/* =========================================================================
   GENERADOR DE EXCEL (.xlsx) SIN DEPENDENCIAS
   Arma el ZIP con los XML mínimos que Excel, Numbers, Google Sheets y
   LibreOffice abren sin quejarse: encabezado en negrita y fijo, filtros,
   anchos de columna, fechas como fechas y montos como números.
   ========================================================================= */

/**
 * sheets: [{ name, columns: [{ header, width?, type? }], rows: [[valor, …], …] }]
 * type: "text" (por defecto), "date" (texto "AAAA-MM-DD"), "money" (número con 2 decimales) o "number".
 * Devuelve los bytes del archivo.
 */
export function writeXlsx(sheets) {
  const names = uniqueNames(sheets.map(s => s.name));
  const files = [
    ["[Content_Types].xml", contentTypes(sheets.length)],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", workbook(names)],
    ["xl/_rels/workbook.xml.rels", workbookRels(sheets.length)],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, worksheet(s)]),
  ];
  return zip(files.map(([name, text]) => [name, new TextEncoder().encode(text)]));
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Estilos: 0 normal · 1 encabezado · 2 fecha · 3 monto · 4 número entero. */
const STYLE = { text: 0, header: 1, date: 2, money: 3, number: 4 };
const STYLES = `${XML}<styleSheet ${NS}>
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBDBDBD"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function contentTypes(count) {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

function workbook(names) {
  const sheets = names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  return `${XML}<workbook ${NS} xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${sheets}</sheets></workbook>`;
}

function workbookRels(count) {
  const rels = Array.from(
    { length: count },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${count + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
}

function worksheet({ columns, rows }) {
  const last = colName(columns.length - 1);
  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`)
    .join("");
  const header = `<row r="1">${columns.map((c, i) => textCell(`${colName(i)}1`, c.header, STYLE.header)).join("")}</row>`;
  const body = rows
    .map((row, r) => {
      const n = r + 2;
      const cells = columns.map((c, i) => cell(`${colName(i)}${n}`, row[i], c.type ?? "text")).join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");
  const filter = rows.length ? `<autoFilter ref="A1:${last}${rows.length + 1}"/>` : "";
  // Encabezado fijo al desplazarse
  const view = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  return `${XML}<worksheet ${NS}><dimension ref="A1:${last}${rows.length + 1}"/>${view}<cols>${cols}</cols><sheetData>${header}${body}</sheetData>${filter}</worksheet>`;
}

function cell(ref, value, type) {
  if (value === "" || value === null || value === undefined) return "";
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return `<c r="${ref}" s="${STYLE.date}"><v>${dateToSerial(value)}</v></c>`;
  if ((type === "money" || type === "number") && typeof value === "number" && Number.isFinite(value))
    return `<c r="${ref}" s="${STYLE[type]}"><v>${type === "money" ? Math.round(value * 100) / 100 : value}</v></c>`;
  return textCell(ref, value, STYLE.text);
}
function textCell(ref, value, style) {
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

/** "AAAA-MM-DD" → número de serie de Excel (días desde el 30/12/1899). */
export function dateToSerial(text) {
  const [y, m, d] = text.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
const colName = n => (n >= 26 ? colName(Math.floor(n / 26) - 1) : "") + String.fromCharCode(65 + (n % 26));
/** Escapa el texto para XML y saca los caracteres de control que Excel no acepta. */
function esc(value) {
  return (
    String(value)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: justamente se sacan los caracteres de control
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}
/** Excel no acepta nombres de hoja repetidos, de más de 31 letras ni con : \ / ? * [ ]. */
function uniqueNames(names) {
  const used = new Set();
  return names.map((raw, i) => {
    const base = String(raw || `Hoja ${i + 1}`)
      .replace(/[:\\/?*[\]]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 31)
      .trim();
    let name = base,
      n = 2;
    while (used.has(name.toLowerCase())) name = `${base.slice(0, 27)} (${n++})`;
    used.add(name.toLowerCase());
    return name;
  });
}

/* ---------- ZIP sin comprimir (es chico y así no depende de nada) ---------- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // versión necesaria
    lv.setUint16(8, 0, true); // sin comprimir
    lv.setUint16(12, 0x21, true); // fecha fija: 1/1/1980
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((t, c) => t + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
