import { test, expect, login, pickSearchable } from "./helpers";

// FLUJO FINANCIERO (admin), grabado en video:
//   Crear cuenta bancaria → registrar un movimiento (gasto) → verlo en la lista.

// Nombre único por corrida (evita choques con cuentas de corridas previas).
const SUF = String(Date.now()).slice(-5);
const CUENTA = `BofA Ops ${SUF}`;
const CONCEPTO = `Compra de carpas ${SUF}`;

// Abre un diálogo de forma robusta: reintenta el click hasta que aparezca el campo esperado.
async function abrir(page, botón: RegExp, campoVisible) {
  await expect(async () => {
    await page.getByRole("button", { name: botón }).first().click();
    await expect(campoVisible()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 25_000 });
}

test("gastos: crear cuenta y registrar movimiento", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "admin");
  await page.goto("/gastos", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page).toHaveURL(/\/gastos/);
  await expect(page.getByRole("heading", { name: /gastos y cuentas/i })).toBeVisible({ timeout: 15_000 });

  // 1) Nueva cuenta
  const nombreCuenta = () => page.getByPlaceholder(/Bank of America.*Operaciones/i);
  await abrir(page, /nueva cuenta/i, nombreCuenta);
  await nombreCuenta().fill(CUENTA);
  const saldo = page.getByRole("spinbutton").first();
  if (await saldo.count()) await saldo.fill("100").catch(() => {});
  await page.getByRole("button", { name: /^guardar$/i }).click();
  await expect(page.getByText(CUENTA).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });

  // 2) Registrar movimiento (egreso)
  const concepto = () => page.getByPlaceholder(/Compra de carpas/i);
  await abrir(page, /registrar movimiento/i, concepto);
  await concepto().fill(CONCEPTO);
  await page.getByRole("spinbutton").first().fill("50").catch(() => {});
  await pickSearchable(page, /selecciona cuenta/i, new RegExp(`BofA Ops ${SUF}`, "i"));
  await page.getByRole("button", { name: /^registrar$/i }).click();

  // 3) El movimiento aparece
  await expect(page.getByText(CONCEPTO).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
});
