import { test, expect, login, pickSearchable } from "./helpers";

// FLUJO FINANCIERO (admin), grabado en video:
//   Crear cuenta bancaria → registrar un movimiento (gasto) → verlo en la lista.

const CUENTA = "BofA Operaciones (test)";
const CONCEPTO = "Compra de carpas";

test("gastos: crear cuenta y registrar movimiento", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "admin");
  await page.goto("/gastos", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page).toHaveURL(/\/gastos/);

  // 1) Nueva cuenta
  await page.getByRole("button", { name: /nueva cuenta/i }).click();
  await expect(page.getByText(/nueva cuenta/i).first()).toBeVisible();
  await page.getByPlaceholder(/Bank of America.*Operaciones/i).fill(CUENTA);
  // saldo inicial (input numérico); si existe, ponle 100
  const saldo = page.getByRole("spinbutton").first();
  if (await saldo.count()) await saldo.fill("100").catch(() => {});
  await page.getByRole("button", { name: /^guardar$/i }).click();
  // La cuenta aparece en la lista
  await expect(page.getByText(CUENTA).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });

  // 2) Registrar movimiento (egreso)
  await page.getByRole("button", { name: /registrar movimiento/i }).click();
  await expect(page.getByText(/nuevo movimiento/i)).toBeVisible();
  await page.getByPlaceholder(/Compra de carpas/i).fill(CONCEPTO);
  // monto
  const monto = page.getByRole("spinbutton").first();
  await monto.fill("50").catch(() => {});
  // cuenta (SearchableSelect)
  await pickSearchable(page, /selecciona cuenta/i, /BofA Operaciones/i);
  await page.getByRole("button", { name: /^registrar$/i }).click();

  // 3) El movimiento aparece
  await expect(page.getByText(CONCEPTO).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
});
