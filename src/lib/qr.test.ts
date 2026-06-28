// Run: npx tsx src/lib/qr.test.ts
import assert from "node:assert";
import ExcelJS from "exceljs";
import { tipoArchivo } from "./qr";

// Enrutado por tipo (la parte con ramas).
assert.equal(tipoArchivo("lista.pdf", "application/pdf"), "pdf");
assert.equal(tipoArchivo("foto.jpg", "image/jpeg"), "foto");
assert.equal(tipoArchivo("scan", "image/png"), "foto", "MIME imagen manda");
assert.equal(tipoArchivo("datos.xlsx", "application/octet-stream"), "excel", "por extensión");
assert.equal(tipoArchivo("datos.csv", "text/csv"), "excel");
assert.equal(tipoArchivo("hoja", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "excel");
assert.equal(tipoArchivo("texto.docx", "application/msword"), null, "word no soportado");

// Smoke: exceljs realmente carga/lee bajo este Node (round-trip en memoria).
async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("h");
  ws.addRow(["Nombre", "Cedula"]);
  ws.addRow(["Ana Perez", "V12345678"]);
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as any);
  let texto = "";
  wb2.eachSheet((s) => s.eachRow((r) => { texto += (r.values as any[]).slice(1).join("\t") + "\n"; }));
  assert.ok(texto.includes("Ana Perez") && texto.includes("V12345678"), "exceljs round-trip");
  console.log("ok");
}
main();
