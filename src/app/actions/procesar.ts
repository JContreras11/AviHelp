"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { procesarImagen } from "@/lib/ai/image";
import { analizarDocumento, analizarTexto, type DocumentoAnalizado } from "@/lib/ai/vision";
import type { ExifMeta } from "@/lib/exif";

export type ProcesarResult =
  | { ok: false; error: string }
  | {
      ok: true;
      tipo: DocumentoAnalizado["tipo"];
      contexto: string | null;
      confianza: number;
      modelo: string;
      foto: string | null;
      hospital_id: string | null;
      personas: any[];
      insumos: any[];
      resumen: string;
    };

// Normaliza cédula para dedup fiable: "V 29.790.834" -> "V29790834".
function normCedula(c: string | null): string | null {
  if (!c) return null;
  const n = c.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  return n || null;
}

const EXIF_VACIO: ExifMeta = { gps_lat: null, gps_lng: null, foto_fecha: null };

// Punto de entrada para FOTO: una imagen -> clasifica -> mapea a entidades.
export async function procesarDocumento(formData: FormData): Promise<ProcesarResult> {
  const file = formData.get("imagen");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No se recibió imagen." };

  const img = await procesarImagen(file, "documentos");
  const res = await analizarDocumento(img.dataUrl);
  if (!res.ok) return { ok: false, error: res.motivo };

  // Geolocalización del navegador como fallback si la foto no trae GPS en EXIF.
  const lat = parseFloat(String(formData.get("gps_lat") ?? ""));
  const lng = parseFloat(String(formData.get("gps_lng") ?? ""));
  const exif = {
    ...img.exif,
    gps_lat: img.exif.gps_lat ?? (isNaN(lat) ? null : lat),
    gps_lng: img.exif.gps_lng ?? (isNaN(lng) ? null : lng),
  };
  return guardar(res.data, res.confianza, res.modelo, img.path, exif);
}

// Punto de entrada para AUDIO/VOZ: texto transcrito -> mismas entidades.
export async function procesarTexto(texto: string): Promise<ProcesarResult> {
  if (!texto?.trim()) return { ok: false, error: "Texto vacío." };
  const res = await analizarTexto(texto);
  if (!res.ok) return { ok: false, error: res.motivo };
  return guardar(res.data, res.confianza, res.modelo, null, EXIF_VACIO);
}

export type AnalisisResult =
  | { ok: false; error: string }
  | {
      ok: true;
      preview: DocumentoAnalizado;
      foto: string | null;
      exif: ExifMeta;
      confianza: number;
      modelo: string;
    };

// FOTO: sube + analiza, devuelve PREVIEW editable (NO guarda en DB todavía).
export async function analizarImagen(formData: FormData): Promise<AnalisisResult> {
  const file = formData.get("imagen");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No se recibió imagen." };

  const img = await procesarImagen(file, "documentos");
  const res = await analizarDocumento(img.dataUrl);
  if (!res.ok) return { ok: false, error: res.motivo };

  const lat = parseFloat(String(formData.get("gps_lat") ?? ""));
  const lng = parseFloat(String(formData.get("gps_lng") ?? ""));
  const exif: ExifMeta = {
    ...img.exif,
    gps_lat: img.exif.gps_lat ?? (isNaN(lat) ? null : lat),
    gps_lng: img.exif.gps_lng ?? (isNaN(lng) ? null : lng),
  };
  return { ok: true, preview: res.data, foto: img.path, exif, confianza: res.confianza, modelo: res.modelo };
}

// VOZ: analiza texto, devuelve PREVIEW editable (NO guarda).
export async function analizarVoz(texto: string): Promise<AnalisisResult> {
  if (!texto?.trim()) return { ok: false, error: "Texto vacío." };
  const res = await analizarTexto(texto);
  if (!res.ok) return { ok: false, error: res.motivo };
  return { ok: true, preview: res.data, foto: null, exif: EXIF_VACIO, confianza: res.confianza, modelo: res.modelo };
}

// Guarda un PREVIEW ya editado por el usuario.
export async function guardarDocumento(input: {
  preview: DocumentoAnalizado;
  foto: string | null;
  exif: ExifMeta;
  confianza: number;
  modelo: string;
}): Promise<ProcesarResult> {
  return guardar(input.preview, input.confianza, input.modelo, input.foto, input.exif);
}

// Persiste un documento ya analizado (compartido entre foto y voz).
async function guardar(
  d: DocumentoAnalizado,
  confianza: number,
  modelo: string,
  fotoPath: string | null,
  exif: ExifMeta,
): Promise<ProcesarResult> {
  const supabase = createAdminClient();

  // 1) Hospital detectado -> upsert (clave natural: nombre).
  let hospitalId: string | null = null;
  if (d.hospital?.nombre) {
    const { data: existente } = await supabase
      .from("hospitales").select("id").eq("nombre", d.hospital.nombre).maybeSingle();
    if (existente) hospitalId = existente.id;
    else {
      const { data } = await supabase
        .from("hospitales")
        .insert({ nombre: d.hospital.nombre, ubicacion: d.hospital.ubicacion })
        .select("id").single();
      hospitalId = data?.id ?? null;
    }
  }

  // 2) Insumos -> al hospital detectado.
  const insumosGuardados: any[] = [];
  if (d.insumos.length && hospitalId) {
    const filas = d.insumos.filter((i) => i.nombre).map((i) => ({
      hospital_id: hospitalId,
      nombre: i.nombre,
      cantidad: i.cantidad,
      unidad: i.unidad,
      prioridad: i.prioridad ?? "media",
      estado: "solicitado",
      fuente: "ia_vision",
      confianza,
      raw_extraccion: i as any,
    }));
    const { data } = await supabase.from("insumos").insert(filas).select();
    insumosGuardados.push(...(data ?? []));
  }

  // 3) Personas -> upsert por cédula normalizada + historial de estado.
  const personasGuardadas: any[] = [];
  for (const p of d.personas) {
    if (!p.nombre) continue;
    const cedula = normCedula(p.cedula);
    const base = {
      nombre: p.nombre,
      cedula,
      edad: p.edad,
      sexo: p.sexo,
      ubicacion: p.ubicacion,
      estado_salud: p.estado_salud ?? "desconocido",
      descripcion_fisica: p.descripcion_fisica,
      telefono_contacto: p.telefono_contacto,
      contacto_nombre: p.contacto_nombre,
      notas: p.notas,
      hospital_id: hospitalId,
      gps_lat: exif.gps_lat,
      gps_lng: exif.gps_lng,
      foto_fecha: exif.foto_fecha,
      fuente: "ia_vision",
      confianza,
      raw_extraccion: p as any,
      fotos: fotoPath ? [fotoPath] : [],
    };

    const existente = cedula
      ? (await supabase.from("personas").select("*").eq("cedula", cedula).maybeSingle()).data
      : null;

    if (existente) {
      if (existente.estado_salud !== base.estado_salud) {
        await supabase.from("persona_historial").insert({
          persona_id: existente.id,
          estado_salud: existente.estado_salud,
          ubicacion: existente.ubicacion,
          hospital_id: existente.hospital_id,
          nota: "Actualización por IA",
          fuente: "ia_vision",
        });
      }
      const fotos = [...new Set([...(existente.fotos ?? []), ...(fotoPath ? [fotoPath] : [])])].slice(0, 3);
      const { data } = await supabase
        .from("personas").update({ ...base, fotos }).eq("id", existente.id).select().single();
      personasGuardadas.push(data);
    } else {
      const { data } = await supabase.from("personas").insert(base).select().single();
      personasGuardadas.push(data);
    }
  }

  const resumen =
    `${d.tipo.replace(/_/g, " ")}: ` +
    [
      personasGuardadas.length && `${personasGuardadas.length} persona(s)`,
      insumosGuardados.length && `${insumosGuardados.length} insumo(s)`,
      d.hospital?.nombre && `hospital ${d.hospital.nombre}`,
    ].filter(Boolean).join(", ");

  return {
    ok: true,
    tipo: d.tipo,
    contexto: d.contexto,
    confianza,
    modelo,
    foto: fotoPath,
    hospital_id: hospitalId,
    personas: personasGuardadas,
    insumos: insumosGuardados,
    resumen,
  };
}
