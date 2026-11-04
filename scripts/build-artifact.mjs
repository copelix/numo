/* Convierte la build de un solo archivo (dist-artifact/index.html) en la página que se publica en Claude:
   sin <!doctype>, <html>, <head> ni <body> (Claude agrega su propio esqueleto) y sin lo que es solo de la web. */
import { readFile, writeFile } from "node:fs/promises";

const src = await readFile(new URL("../dist-artifact/index.html", import.meta.url), "utf8");
const head = src.slice(src.indexOf("<head>") + 6, src.indexOf("</head>"));
const body = src.slice(src.indexOf("<body>") + 6, src.lastIndexOf("</body>"));

const keep = tag => !/data-web-only/.test(tag) && !/<meta charset|name="viewport"/.test(tag);
const headTags = head.match(/<title>[\s\S]*?<\/title>|<meta[^>]*>|<link[^>]*>|<style[^>]*>[\s\S]*?<\/style>|<script[^>]*>[\s\S]*?<\/script>|<!--[\s\S]*?-->/g) ?? [];
const scripts = headTags.filter(t => t.startsWith("<script") && keep(t));
const rest = headTags.filter(t => !t.startsWith("<script") && !t.startsWith("<!--") && keep(t));
const markup = body.replace(/<script type="module"[^>]*src=[^>]*><\/script>/, "").trim();

const page = [...rest, markup, ...scripts].join("\n") + "\n";
await writeFile(new URL("../dist-artifact/numo-claude.html", import.meta.url), page);
console.log(`dist-artifact/numo-claude.html (${(page.length / 1024).toFixed(0)} KB)`);
