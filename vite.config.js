import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const version = pkg.version.split(".").slice(0, 2).join(".");      // "8.1"

/** Service worker generado en cada build: guarda la app (con sus archivos con hash) para abrirla sin conexión. */
function serviceWorker() {
  return {
    name: "numo-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter(f => !f.endsWith(".html") && !f.endsWith(".map")).map(f => `/${f}`);
      const template = readFileSync(new URL("./scripts/sw.template.js", import.meta.url), "utf8");
      const shell = ["/", "/config.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/favicon-32.png", ...assets];
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: template.replace("__CACHE__", `numo-${pkg.version}-${Date.now().toString(36)}`).replace("__SHELL__", JSON.stringify(shell)),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: mode === "artifact"
    ? { outDir: "dist-artifact", emptyOutDir: true, copyPublicDir: false, target: "es2022", cssTarget: "chrome111" }
    : { outDir: "dist", emptyOutDir: true, target: "es2022", cssTarget: "chrome111" },
  plugins: mode === "artifact" ? [viteSingleFile()] : [serviceWorker()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.js"],
    setupFiles: ["tests/unit/setup.js"],
  },
}));
