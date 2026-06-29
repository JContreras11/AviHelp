// Extracción de texto de un PDF con unpdf (build serverless de pdfjs, SIN dependencias
// del DOM como DOMMatrix/canvas). pdf-parse fallaba en Vercel: "DOMMatrix is not defined".
// Aislado aquí para poder testearlo sin el contexto "use server".
export async function pdfATexto(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? "";
}

// PDF mínimo válido con un texto (para pruebas/diagnóstico, sin dependencias).
export function pdfDePrueba(texto: string): Buffer {
  const safe = texto.replace(/[()\\]/g, " ");
  const contenido = `BT /F1 24 Tf 72 700 Td (${safe}) Tj ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${contenido.length}>>\nstream\n${contenido}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let pdf = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
