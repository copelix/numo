import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "allow",
  },
  projects: [{
    name: "chromium",
    use: {
      browserName: "chromium",
      // Opcional: usar un Chromium ya instalado en vez del que descarga Playwright.
      launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
    },
  }],
  webServer: {
    command: "npm run build && node scripts/serve.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
