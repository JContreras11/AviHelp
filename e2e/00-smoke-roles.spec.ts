import { Page } from "@playwright/test";
import { test, expect, login } from "./helpers";

// Smoke por rol: cada usuario entra y visita SUS páginas; se verifica que
// renderizan (no rebotan, no lanzan excepción JS). Graba video de cada recorrido.

function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  return errs;
}

const esc = (p: string) => p.replace(/[/]/g, "\\/");

async function visita(page: Page, path: string) {
  // waitUntil:commit + catch → no aborta si la página hace redirect de cliente/RSC.
  await page.goto(path, { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  // No debe rebotar a /login (sesión OK) y la URL debe ser la pedida.
  await expect(page, `${path} rebotó a login`).not.toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(esc(path) + "(\\?|#|$)"), { timeout: 15_000 });
  // Contenido real presente (no página en blanco / crash).
  await expect(page.locator("h1, h2, main, [role=main]").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500); // pinta para el video
}

test.describe("Smoke logística (voluntario de centro)", () => {
  test("recorre módulos operativos", async ({ page }) => {
    const errs = watchErrors(page);
    await login(page, "voluntario");
    for (const p of ["/checkin", "/inventario", "/inspeccion", "/despacho", "/camiones", "/calendario", "/vencimientos"]) {
      await visita(page, p);
    }
    // ignora ruido conocido de terceros; falla solo por errores de la app
    const reales = errs.filter((e) => !/favicon|manifest|hydration warning/i.test(e));
    expect(reales, reales.join("\n")).toHaveLength(0);
  });
});

test.describe("Smoke admin", () => {
  test("recorre panel + finanzas + catálogo", async ({ page }) => {
    const errs = watchErrors(page);
    await login(page, "admin");
    for (const p of ["/admin/categorias", "/gastos", "/inventario", "/dashboard", "/admin/usuarios"]) {
      await visita(page, p);
    }
    const reales = errs.filter((e) => !/favicon|manifest|hydration warning/i.test(e));
    expect(reales, reales.join("\n")).toHaveLength(0);
  });
});

test.describe("Smoke público (sin login)", () => {
  test("ve inicio y páginas públicas", async ({ page }) => {
    const errs = watchErrors(page);
    for (const p of ["/", "/publico", "/refugios", "/ayuda"]) {
      await visita(page, p);
    }
    const reales = errs.filter((e) => !/favicon|manifest|hydration warning/i.test(e));
    expect(reales, reales.join("\n")).toHaveLength(0);
  });
});
