import { test as base, Page, expect } from "@playwright/test";

// Test extendido: desactiva el modal de Bienvenida (onboarding 1a-visita) que
// overlaya todo en un contexto limpio, antes de cualquier navegación.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try { localStorage.setItem("avi_bienvenida_v1", "1"); } catch {}
    });
    await use(page);
  },
});
export { expect };

// Usuarios de prueba (passwords reseteados por el harness; ver e2e/README.md).
export const USERS = {
  admin:      { email: "e2e-admin@avihelp.test",      pass: "Avi!Test2607" },
  voluntario: { email: "e2e-voluntario@avihelp.test", pass: "Avi!Test2607" }, // logística (miembro de centro TEST)
  medico:     { email: "e2e-medico@avihelp.test",     pass: "Avi!Test2607" },
  ong:        { email: "e2e-ong@avihelp.test",        pass: "Avi!Test2607" },
} as const;

export type RolKey = keyof typeof USERS;

// Inicia sesión vía el form real (/login usa signInWithPassword → cookies SSR).
export async function login(page: Page, rol: RolKey) {
  const { email, pass } = USERS[rol];
  await page.goto("/login", { waitUntil: "commit" }).catch(() => {});
  const emailBox = page.locator('input[type="email"]');
  const passBox = page.locator('input[type="password"]');
  await emailBox.waitFor({ state: "visible" });
  // React controla los inputs: si se llenan antes de hidratar, el valor se pierde.
  // Reintenta el fill hasta que el valor "pegue".
  await expect(async () => {
    await emailBox.fill(email);
    await expect(emailBox).toHaveValue(email, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(async () => {
    await passBox.fill(pass);
    await expect(passBox).toHaveValue(pass, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.getByRole("button", { name: /entrar|ingresar|iniciar/i }).click();
  // Tras login redirige a next (/). Esperamos salir de /login.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

const esc = (p: string) => p.replace(/[/]/g, "\\/");

// Navega ya autenticado y verifica que NO rebota (la ruta queda accesible).
export async function gotoOk(page: Page, path: string) {
  await page.goto(path, { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page, `${path} debería ser accesible`).toHaveURL(new RegExp(esc(path) + "(\\?|#|$)"), { timeout: 20_000 });
}

// Elige una opción en un SearchableSelect (combobox → listbox → option).
// `triggerText`: texto visible del botón (placeholder o valor actual).
export async function pickSearchable(page: Page, triggerText: string | RegExp, optionText: string | RegExp) {
  let combo = page.getByRole("combobox").filter({ hasText: triggerText }).first();
  if (!(await combo.count())) combo = page.getByRole("combobox").first();
  await combo.scrollIntoViewIfNeeded().catch(() => {});
  await combo.click();
  const search = page.getByRole("listbox").locator("input").first();
  if ((await search.count()) && typeof optionText === "string") {
    await search.fill(optionText).catch(() => {});
  }
  await page.getByRole("option", { name: optionText }).first().click();
}

// Verifica que una ruta restringida REBOTA (a / o /login) para un rol sin permiso.
export async function gotoBlocked(page: Page, path: string) {
  await page.goto(path, { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page, `${path} debería estar bloqueada`).not.toHaveURL(new RegExp(esc(path) + "(\\?|#|$)"), { timeout: 20_000 });
}
