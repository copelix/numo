/* Servidor local para probar la build como en Netlify: sirve dist/ y aplica las cabeceras de public/_headers. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../dist/", import.meta.url).pathname;
const port = Number(process.env.PORT) || 4173;
const extraConnect = process.env.EXTRA_CONNECT_SRC || ""; // las pruebas agregan su Supabase simulado
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) {
      current = { path: line.trim(), headers: [] };
      rules.push(current);
    } else {
      const i = line.indexOf(":");
      current.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}
const matches = (pattern, path) => (pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path);

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(root, "index.html");
  }
  try {
    const body = await readFile(file);
    const rules = parseHeaders(await readFile(join(root, "_headers"), "utf8"));
    for (const rule of rules) {
      if (!matches(rule.path, path)) continue;
      for (const [k, v] of rule.headers)
        res.setHeader(
          k,
          k === "Content-Security-Policy" && extraConnect
            ? v.replace("connect-src 'self'", `connect-src 'self' ${extraConnect}`)
            : v,
        );
    }
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.writeHead(404).end("No encontrado");
  }
}).listen(port, () => console.log(`Numo en http://localhost:${port}`));
