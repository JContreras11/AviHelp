import { test, expect, login, gotoOk, gotoBlocked } from "./helpers";

// Matriz de permisos: quién ENTRA y quién es REBOTADO en cada módulo.
// Documenta en video el control de acceso por rol.

const LOGISTICA = ["/checkin", "/inventario", "/inspeccion", "/despacho", "/camiones", "/calendario"];

test("voluntario de centro (logística) ENTRA a los módulos operativos", async ({ page }) => {
  await login(page, "voluntario");
  for (const p of LOGISTICA) await gotoOk(page, p);
});

// NOTA de diseño: por el modelo "fuente única" un miembro de HOSPITAL obtiene
// alcance de centro (centroIds), así que médico/ONG con membresía de hospital
// SÍ pueden entrar a logística. El invariante limpio que se valida es el
// bloqueo de las páginas SOLO-ADMIN. Ver docs/RUNBOOK_ADMIN.md (follow-up).
const SOLO_ADMIN = ["/admin/categorias", "/admin/usuarios", "/admin/instituciones"];

test("médico es REBOTADO de las páginas solo-admin", async ({ page }) => {
  await login(page, "medico");
  for (const p of SOLO_ADMIN) await gotoBlocked(page, p);
});

test("ONG es REBOTADA de las páginas solo-admin", async ({ page }) => {
  await login(page, "ong");
  for (const p of SOLO_ADMIN) await gotoBlocked(page, p);
});

test("admin ENTRA a todo (logística + admin)", async ({ page }) => {
  await login(page, "admin");
  for (const p of [...LOGISTICA, "/gastos", "/admin/categorias", "/admin/usuarios"]) await gotoOk(page, p);
});

test("categorías es SOLO admin (voluntario rebotado)", async ({ page }) => {
  await login(page, "voluntario");
  await gotoBlocked(page, "/admin/categorias");
});

test("público (sin login) es enviado a /login en rutas privadas, pero ve /publico", async ({ page }) => {
  // sin login: ruta privada → /login
  await page.goto("/inventario", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  // vista pública accesible sin login
  await page.goto("/publico", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page).toHaveURL(/\/publico/, { timeout: 15_000 });
});
