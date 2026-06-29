// Run: npx tsx src/lib/pdf.test.ts
// Prueba real: genera un PDF con texto conocido y verifica que unpdf lo extrae.
import assert from "node:assert";
import { pdfATexto, pdfDePrueba } from "./pdf";

async function main() {
  const esperado = "PACIENTES HMPC 2 LISTA";
  const buf = pdfDePrueba(esperado);
  const texto = await pdfATexto(buf);
  assert.ok(texto.includes(esperado), `el PDF debía contener "${esperado}", se extrajo: ${JSON.stringify(texto)}`);
  console.log("ok ·", JSON.stringify(texto.trim()));
}
main();
