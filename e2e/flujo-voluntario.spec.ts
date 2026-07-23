import { test, expect, login, pickSearchable } from "./helpers";

// FLUJO VOLUNTARIO (del Google Form real), grabado en video:
//   Registro público del personal de salud → aparece en el roster de logística (pendiente).

const NOMBRE = "Dra. Prueba Voluntaria";

test("registro público de voluntario → roster logística", async ({ page }) => {
  test.setTimeout(90_000);

  // ── 1) REGISTRO PÚBLICO (sin login) ────────────────────────────
  await page.goto("/voluntarios/registro", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page).toHaveURL(/\/voluntarios\/registro/);

  await page.getByPlaceholder(/María Pérez/i).fill(NOMBRE);
  await page.getByPlaceholder(/V-12\.345\.678/i).fill("V-19345678");
  await page.getByPlaceholder(/Ej\. 28/i).fill("34");
  await page.getByPlaceholder(/0412-1234567/i).fill("0414-5551234");
  await pickSearchable(page, /busca tu estado/i, /Miranda/i);
  await page.getByPlaceholder(/padre/i).fill("José Pérez — hermano, 0414-7654321");
  await pickSearchable(page, /selecciona tu área/i, /Médico General/i);
  await page.getByPlaceholder(/Ej\. 123456/i).fill("123456");
  // Grupos de botones (logística/disponibilidad)
  await page.getByRole("button", { name: "Entre semana" }).click();
  await page.getByRole("button", { name: "Días fijos en la semana" }).click();
  await page.getByRole("button", { name: "12 horas" }).click();
  await page.getByRole("button", { name: /^s[íi]$/i }).first().click();
  await page.getByRole("button", { name: "De forma individual" }).click();
  // Datos de salud
  await pickSearchable(page, /selecciona tu grupo/i, /^O\+$/);
  await page.getByPlaceholder(/penicilina/i).fill("Ninguna");

  await page.getByRole("button", { name: /enviar registro/i }).click();
  // Confirmación
  await expect(page.getByText(/gracias|registro (recibido|enviado)|te contactaremos|recibimos/i).first())
    .toBeVisible({ timeout: 20_000 });

  // ── 2) ROSTER (logística ve al voluntario como pendiente) ───────
  await login(page, "voluntario");
  await page.goto("/voluntarios", { waitUntil: "commit" }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await expect(page.getByText(NOMBRE).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
});
