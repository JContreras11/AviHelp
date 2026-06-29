"use server";

import { analizarTexto } from "@/lib/ai/vision";
import { pdfATexto } from "@/lib/pdf";
import { createAdminClient } from "@/lib/supabase/server";
import type { AnalisisResult } from "@/app/actions/procesar";

// Hospitales/clínicas/refugios existentes para el selector del DocCard (evita duplicar por nombre).
export async function listarHospitalesSelect(): Promise<{ id: string; nombre: string; tipo: string }[]> {
  const s = createAdminClient();
  const { data } = await s.from("hospitales").select("id,nombre,tipo").order("nombre");
  return data ?? [];
}

// Nuevos formatos de carga (PDF, Excel, QR/URL). Cada uno EXTRAE texto y lo pasa
// por el MISMO análisis IA + preview editable que foto/voz. No toca el flujo existente.
const EXIF_VACIO = { gps_lat: null, gps_lng: null, foto_fecha: null };
const CHUNK = 4000;     // chars/llamada (~100 filas): JSON chico que NO se trunca; los trozos van en paralelo
const MAX_CHUNKS = 14;  // tope de seguridad (~56k chars)

// Trocea por líneas sin partir filas, respetando el límite de chars por trozo.
function trozos(texto: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ln of texto.split(/\r?\n/)) {
    if (cur && cur.length + ln.length + 1 > CHUNK) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + ln;
  }
  if (cur.trim()) out.push(cur);
  return out.length ? out : [texto];
}

// Convierte texto extraído en un preview editable (la IA decide si hay personas/insumos).
// Listas largas (PDF/Excel de pacientes) se trocean y analizan en paralelo, luego se fusionan:
// cada trozo da un JSON pequeño, así nunca se corta por longitud.
async function analizarLista(texto: string, etiqueta: string): Promise<AnalisisResult> {
  const limpio = (texto ?? "").trim();
  if (!limpio) return { ok: false, error: `No se extrajo texto de ${etiqueta}.` };

  const partes = trozos(limpio).slice(0, MAX_CHUNKS);
  const reses = await Promise.all(partes.map((t) => analizarTexto(t)));
  const oks = reses.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
  if (!oks.length) {
    const fallo = reses.find((r) => !r.ok) as { motivo?: string } | undefined;
    return { ok: false, error: fallo?.motivo ?? "No se pudo interpretar el documento." };
  }

  const base = oks[0].data;
  const conPersonas = oks.find((o) => o.data.personas.length)?.data;
  const preview = {
    ...base,
    contexto: `📄 ${etiqueta}`,
    tipo: conPersonas?.tipo ?? base.tipo,
    hospital: oks.map((o) => o.data.hospital).find(Boolean) ?? null,
    personas: oks.flatMap((o) => o.data.personas),
    insumos: oks.flatMap((o) => o.data.insumos),
  };
  const confianza = Math.min(...oks.map((o) => o.confianza));
  return { ok: true, preview, foto: null, exif: EXIF_VACIO, confianza, modelo: oks[0].modelo };
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

// Word .docx -> texto plano (mammoth, JS puro, serverless-safe).
async function docxATexto(buf: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  const { value } = await (mammoth as any).extractRawText({ buffer: buf });
  return value ?? "";
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

export async function analizarDOCX(formData: FormData): Promise<AnalisisResult> {
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No se recibió documento." };
  const buf = Buffer.from(await file.arrayBuffer());
  let texto: string;
  try { texto = await docxATexto(buf); }
  catch (e: any) { return { ok: false, error: `No se pudo leer el Word (${e?.message ?? "error"}). Pega el texto o súbelo como PDF.` }; }
  if (!texto.trim()) return { ok: false, error: "El Word no tiene texto." };
  return analizarLista(texto, `Word: ${file.name}`);
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
