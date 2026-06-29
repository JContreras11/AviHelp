"use server";

import { analizarTexto } from "@/lib/ai/vision";
import { pdfATexto } from "@/lib/pdf";
import type { AnalisisResult } from "@/app/actions/procesar";

// Nuevos formatos de carga (PDF, Excel, QR/URL). Cada uno EXTRAE texto y lo pasa
// por el MISMO análisis IA + preview editable que foto/voz. No toca el flujo existente.
const EXIF_VACIO = { gps_lat: null, gps_lng: null, foto_fecha: null };
const MAX = 24000; // recorte para no pasarse de contexto del modelo

// Convierte texto extraído en un preview editable (la IA decide si hay personas/insumos).
async function analizarLista(texto: string, etiqueta: string): Promise<AnalisisResult> {
  if (!texto?.trim()) return { ok: false, error: `No se extrajo texto de ${etiqueta}.` };
  const res = await analizarTexto(texto.slice(0, MAX));
  if (!res.ok) return { ok: false, error: res.motivo };
  res.data.contexto = `📄 ${etiqueta}`;
  return { ok: true, preview: res.data, foto: null, exif: EXIF_VACIO, confianza: res.confianza, modelo: res.modelo };
}

// La lectura de PDF puede fallar en algún entorno. Nunca dejar que un throw burbujee
// como "Server Components render error": lo devolvemos como mensaje legible.
async function pdfATextoSeguro(buf: Buffer): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  try {
    return { ok: true, texto: await pdfATexto(buf) };
  } catch (e: any) {
    return { ok: false, error: `No se pudo leer el PDF (${e?.message ?? "error"}). Prueba subirlo como foto.` };
  }
}

async function excelATexto(buf: Buffer, nombre: string): Promise<string> {
  if (nombre.toLowerCase().endsWith(".csv")) return buf.toString("utf8");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const filas: string[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      const celdas = (row.values as any[]).slice(1).map((v) =>
        v == null ? "" : typeof v === "object" ? (v.text ?? v.result ?? v.hyperlink ?? "") : v);
      filas.push(celdas.join("\t"));
    });
  });
  return filas.join("\n");
}

// Quita etiquetas HTML dejando el texto (suficiente para que la IA estructure tablas).
function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export async function analizarPDF(formData: FormData): Promise<AnalisisResult> {
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No se recibió PDF." };
  const buf = Buffer.from(await file.arrayBuffer());
  const r = await pdfATextoSeguro(buf);
  if (!r.ok) return r;
  if (!r.texto.trim()) return { ok: false, error: "PDF sin texto (¿escaneado?). Súbelo como foto para leerlo con la cámara." };
  return analizarLista(r.texto, `PDF: ${file.name}`);
}

export async function analizarExcel(formData: FormData): Promise<AnalisisResult> {
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No se recibió archivo." };
  const buf = Buffer.from(await file.arrayBuffer());
  const texto = await excelATexto(buf, file.name);
  return analizarLista(texto, `Hoja: ${file.name}`);
}

// QR o fuente externa autorizada: trae el contenido del enlace y lo analiza.
export async function analizarURL(url: string): Promise<AnalisisResult> {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, error: "El QR no contiene un enlace válido." }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, error: "El QR no es un enlace web (http/https)." };
  try {
    const resp = await fetch(u, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 AviHelp" } });
    if (!resp.ok) return { ok: false, error: `El enlace respondió ${resp.status}.` };
    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("pdf")) {
      const r = await pdfATextoSeguro(Buffer.from(await resp.arrayBuffer()));
      if (!r.ok) return r;
      if (!r.texto.trim()) return { ok: false, error: "El PDF del enlace no tiene texto." };
      return analizarLista(r.texto, `Lista de ${u.hostname}`);
    }
    if (ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("csv")) {
      const texto = await excelATexto(Buffer.from(await resp.arrayBuffer()), u.pathname);
      return analizarLista(texto, `Lista de ${u.hostname}`);
    }
    const raw = await resp.text();
    const texto = ct.includes("html") ? htmlATexto(raw) : raw;
    return analizarLista(texto, `Lista de ${u.hostname}`);
  } catch (e: any) {
    return { ok: false, error: `No se pudo leer el enlace: ${e?.message ?? "error de red"}` };
  }
}
