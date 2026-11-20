/* =========================================================================
   LECTOR DE EXCEL (.xlsx) SIN DEPENDENCIAS
   Un .xlsx es un ZIP con archivos XML adentro. Acá se abre el ZIP (el navegador
   descomprime con DecompressionStream), se leen las hojas y se devuelven sus
   celdas como filas. Las fechas salen como texto "AAAA-MM-DD".
   No lee el formato viejo .xls (binario): para eso hay que guardarlo como .xlsx.
   ========================================================================= */

/** Lee un .xlsx. Devuelve [{ name, rows: [[celda, …], …] }] con las hojas en orden. */
export async function readXlsx(buffer) {
  const files = await unzip(buffer);
  const xml = path => {
    const text = files.get(path);
    return text === undefined ? null : parseXml(text);
  };
  const workbook = xml("xl/workbook.xml");
  if (!workbook) throw new Error("No es un archivo de Excel (.xlsx)");

  const date1904 = /^(1|true)$/i.test(byTag(workbook, "workbookPr")[0]?.getAttribute("date1904") ?? "");
  const strings = sharedStrings(xml("xl/sharedStrings.xml"));
  const dateStyles = dateStyleIndexes(xml("xl/styles.xml"));
  const targets = relationships(xml("xl/_rels/workbook.xml.rels"));

  return byTag(workbook, "sheet").map((sheet, i) => {
    const rid = sheet.getAttribute("r:id") ?? sheet.getAttributeNS?.(REL_NS, "id");
    const target = targets.get(rid) ?? `worksheets/sheet${i + 1}.xml`;
    const file = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const doc = xml(file);
    return {
      name: sheet.getAttribute("name") ?? `Hoja ${i + 1}`,
      rows: doc ? sheetRows(doc, strings, dateStyles, date1904) : [],
    };
  });
}

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function parseXml(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}
/** Busca por nombre local: ignora el prefijo del espacio de nombres (x:row, row…). */
function byTag(node, name) {
  return [...node.getElementsByTagName("*")].filter(el => el.localName === name);
}
function child(node, name) {
  return [...node.children].find(el => el.localName === name) ?? null;
}

function sharedStrings(doc) {
  if (!doc) return [];
  // Cada <si> puede ser texto simple (<t>) o con formato (varios <r><t>); se omiten las guías fonéticas (<rPh>)
  return byTag(doc, "si").map(si =>
    byTag(si, "t")
      .filter(t => t.parentElement?.localName !== "rPh")
      .map(t => t.textContent)
      .join(""),
  );
}

function relationships(doc) {
  const map = new Map();
  if (doc) for (const rel of byTag(doc, "Relationship")) map.set(rel.getAttribute("Id"), rel.getAttribute("Target"));
  return map;
}

/** Qué estilos de celda son fechas: los formatos de fecha de Excel (14–22, 45–47) y los propios con d/m/a. */
function dateStyleIndexes(doc) {
  const set = new Set();
  if (!doc) return set;
  const custom = new Map(
    byTag(doc, "numFmt").map(f => [Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? ""]),
  );
  const xfs = byTag(doc, "cellXfs")[0];
  if (!xfs) return set;
  [...xfs.children]
    .filter(el => el.localName === "xf")
    .forEach((xf, i) => {
      const id = Number(xf.getAttribute("numFmtId") ?? 0);
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom.has(id) && isDateFormat(custom.get(id))))
        set.add(i);
    });
  return set;
}
export function isDateFormat(code) {
  const plain = code
    .replace(/"[^"]*"/g, "") // texto entre comillas
    .replace(/\[[^\]]*\]/g, "") // colores y monedas: [Red], [$-es-AR]
    .replace(/\\./g, "");
  return /[dmy]/i.test(plain) && !/^[#0.,\s%]*$/.test(plain);
}

/** Número de serie de Excel → "AAAA-MM-DD". Excel cuenta días desde 1900 (con el 29/2/1900 que no existió). */
export function serialToDate(serial, date1904 = false) {
  const days = Math.floor(serial) + (date1904 ? 1462 : 0);
  const ms = Date.UTC(1899, 11, 30) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** "AB12" → 27 (columna, desde 0). */
function columnIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref ?? "")?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetRows(doc, strings, dateStyles, date1904) {
  const rows = [];
  for (const row of byTag(doc, "row")) {
    const r = Number(row.getAttribute("r")) - 1;
    const index = Number.isInteger(r) && r >= 0 ? r : rows.length;
    const cells = [];
    let next = 0;
    for (const c of [...row.children].filter(el => el.localName === "c")) {
      const ref = c.getAttribute("r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const value = cellValue(c, strings, dateStyles, date1904);
      if (value !== "") cells[col] = value;
    }
    rows[index] = Array.from(cells, v => v ?? "");
  }
  return Array.from(rows, r => r ?? []);
}

function cellValue(c, strings, dateStyles, date1904) {
  const type = c.getAttribute("t");
  const v = child(c, "v")?.textContent ?? "";
  if (type === "s") return strings[Number(v)] ?? "";
  if (type === "inlineStr")
    return byTag(c, "t")
      .map(t => t.textContent)
      .join("");
  if (type === "str" || type === "e") return type === "e" ? "" : v;
  if (type === "b") return v === "1" ? "VERDADERO" : "FALSO";
  if (v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (dateStyles.has(Number(c.getAttribute("s") ?? 0)) && n > 0 && n < 2958466) return serialToDate(n, date1904);
  return n;
}

/* ---------- ZIP ---------- */
async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin del directorio central: firma 0x06054b50, buscada desde el final (puede haber un comentario)
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("No es un archivo de Excel (.xlsx)");
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP dañado");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    // Solo hacen falta los XML del libro
    if (!/^xl\/.*\.(xml|rels)$/i.test(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, decoder.decode(data));
    else if (method === 8) files.set(name, decoder.decode(await inflate(data)));
  }
  return files;
}

async function inflate(data) {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
