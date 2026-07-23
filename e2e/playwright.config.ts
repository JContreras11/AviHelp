import { defineConfig, devices } from "@playwright/test";

// Suite e2e AviHelp — graba VIDEO de cada flujo por rol (documentación viva).
// Corre contra el dev server local (lo levanta si no está: pnpm dev).
// Uso:  pnpm e2e            (todo, headless, con video)
//       pnpm e2e:ui         (modo UI interactivo)
//       npx playwright test e2e/flujo-acopio.spec.ts   (un flujo)
// Salida de videos: e2e/videos/  ·  reporte HTML: e2e/report/
export default defineConfig({
  testDir: ".",
  fullyParallel: false,          // flujos con dependencia de datos → orden estable
  workers: 1,
  retries: 0,
  timeout: 120_000,              // el dev server compila cada ruta en frío la 1a vez
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "report", open: "never" }]],
  outputDir: "videos",
  use: {
    baseURL: "http://localhost:3000",
    video: "on",                 // graba SIEMPRE (documentación)
    trace: "on",
    screenshot: "only-on-failure",
    actionTimeout: 25_000,
    locale: "es-VE",
    viewport: { width: 393, height: 851 }, // mobile-first
  },
  // Pixel 5 = Chromium (instalado). iPhone/WebKit requeriría `npx playwright install webkit`.
  projects: [{ name: "mobile", use: { ...devices["Pixel 5"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
