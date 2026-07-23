import { test, expect, login, pickSearchable } from "./helpers";

// FLUJO OPERATIVO COMPLETO (voluntario de centro), grabado en video:
//   Recepción (check-in) → Inspección → Inventario.
// Documenta "cómo se ingresa la data" de punta a punta.

// Cédula única por corrida (sin Date.now/random en app; usamos hora de test aquí no aplica,
// variamos por un sufijo fijo que se limpia con clean.sh entre corridas).
const CEDULA = "18345670";
const ITEM = "Harina de maíz PAN";

test("recepción → inspección → inventario", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "voluntario");

  // ── 1) CHECK-IN ────────────────────────────────────────────────
  await page.goto("/checkin", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page).toHaveURL(/\/checkin/);

  // Paso 0 — Donante (prefijo "V" ya viene por defecto)
  await page.getByPlaceholder("Número").first().fill(CEDULA);
  await page.getByPlaceholder("Número").first().blur();
  await page.waitForTimeout(1200); // deja correr el lookup por cédula
  // Si es nuevo, pide nombre/apellido
  const nombre = page.getByPlaceholder("Nombre").first();
  if (await nombre.isVisible().catch(() => false)) {
    await nombre.fill("Donante");
    await page.getByPlaceholder("Apellido").first().fill("De Prueba");
  }
  await page.getByRole("button", { name: /siguiente/i }).click();

  // Paso 1 — Centro (si hay selector) + categorías
  const centroCombo = page.getByRole("combobox").filter({ hasText: /centro/i });
  if (await centroCombo.count()) await pickSearchable(page, /centro/i, /TEST/i);
  await page.getByRole("checkbox", { name: "Alimentos" }).check();
  await page.getByRole("button", { name: /siguiente/i }).click();

  // Paso 2 — Ítems
  await page.getByPlaceholder("Nombre del ítem").first().fill(ITEM);
  await page.getByPlaceholder("Cantidad").first().fill("20");
  await page.getByPlaceholder("Unidad").first().fill("kg");
  await page.getByRole("button", { name: /registrar recepción/i }).click();

  // Confirmación
  await expect(page.getByText(/recepción registrada/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /registrar otra recepción/i })).toBeVisible();

  const ITEM_RX = /Harina de ma/i; // sin acento (evita NFC/NFD); "Harina de maíz PAN"
  const itemVisible = () => page.getByText(ITEM_RX).filter({ visible: true }).first();

  // ── 2) INSPECCIÓN ──────────────────────────────────────────────
  await page.goto("/inspeccion", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(itemVisible()).toBeVisible({ timeout: 15_000 });
  // Abre el modal de inspección del primer ítem por revisar
  await page.getByRole("button", { name: /inspeccionar/i }).first().click();
  await expect(page.getByText(/inspeccionar:/i)).toBeVisible({ timeout: 10_000 });
  // Inspector: rol → nombre (ambos SearchableSelect en el modal)
  await pickSearchable(page, /elige un rol/i, /.+/).catch(() => {});
  const combos = page.getByRole("combobox");
  if ((await combos.count()) > 1) {
    await combos.nth(1).click().catch(() => {});
    await page.getByRole("option").first().click().catch(() => {});
  }
  // Resultado: Disponible → Confirmar
  await page.getByRole("button", { name: /^disponible$/i }).click().catch(() => {});
  await page.getByRole("button", { name: /confirmar|guardar/i }).last().click();
  await expect(page.getByText(/inspeccionar:/i)).toBeHidden({ timeout: 10_000 });

  // ── 3) INVENTARIO ──────────────────────────────────────────────
  await page.goto("/inventario", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(itemVisible()).toBeVisible({ timeout: 15_000 });
  // Al menos un ítem quedó "Disponible" tras la inspección.
  await expect(page.getByText(/disponible/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
});
