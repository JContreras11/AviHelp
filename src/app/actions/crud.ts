"use server";

import { createAdminClient } from "@/lib/supabase/server";

// ── Personas ──
export async function getPersona(id: string) {
  const s = createAdminClient();
  const [{ data: persona }, { data: historial }] = await Promise.all([
    s.from("personas").select("*, hospitales(nombre, gps_lat, gps_lng)").eq("id", id).single(),
    s.from("persona_historial").select("*").eq("persona_id", id).order("created_at", { ascending: false }),
  ]);
  return { persona, historial: historial ?? [] };
}

const CAMPOS_PERSONA = [
  "nombre", "cedula", "edad", "sexo", "ubicacion", "estado_salud",
  "descripcion_fisica", "telefono_contacto", "contacto_nombre", "notas",
];

export async function actualizarPersona(id: string, campos: Record<string, any>) {
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_PERSONA) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("personas").update(limpio).eq("id", id).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, persona: data };
}

export async function eliminarPersona(id: string) {
  const s = createAdminClient();
  const { error } = await s.from("personas").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Insumos ──
export async function getInsumo(id: string) {
  const s = createAdminClient();
  const [{ data: insumo }, { data: eventos }] = await Promise.all([
    s.from("insumos").select("*, hospitales(nombre, ubicacion, gps_lat, gps_lng)").eq("id", id).single(),
    s.from("insumo_eventos").select("*").eq("insumo_id", id).order("created_at", { ascending: false }),
  ]);
  return { insumo, eventos: eventos ?? [] };
}

export async function actualizarInsumo(id: string, campos: Record<string, any>) {
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of ["nombre", "cantidad", "unidad", "presentacion", "area", "para_que_sirve", "alternativas", "prioridad", "estado", "donante"])
    if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("insumos").update(limpio).eq("id", id).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, insumo: data };
}

// "Cubierto": el hospital/área verifica que recibió el insumo -> sale de la lista activa.
export async function cubrirInsumo(id: string, por?: string, nota?: string) {
  const s = createAdminClient();
  const { data, error } = await s.from("insumos")
    .update({ estado: "cubierto", cubierto_at: new Date().toISOString(), cubierto_por: por ?? null })
    .eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await s.from("insumo_eventos").insert({ insumo_id: id, estado: "cubierto", actor: por, nota: nota ?? "Recibido/verificado" });
  return { ok: true, insumo: data };
}

export async function eliminarInsumo(id: string) {
  const s = createAdminClient();
  const { error } = await s.from("insumos").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Cambia estado del insumo (solicitado -> en_transito -> entregado) + registra evento de tracking.
export async function cambiarEstadoInsumo(id: string, estado: string, actor?: string, nota?: string) {
  const s = createAdminClient();
  const { data, error } = await s.from("insumos")
    .update({ estado, ...(actor ? { donante: actor } : {}) }).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await s.from("insumo_eventos").insert({ insumo_id: id, estado, actor, nota });
  return { ok: true, insumo: data };
}

// ── Hospitales ──
export async function getHospital(id: string) {
  const s = createAdminClient();
  const [{ data: hospital }, { data: insumos }] = await Promise.all([
    s.from("hospitales").select("*").eq("id", id).single(),
    s.from("insumos").select("id,nombre,cantidad,unidad,presentacion,area,prioridad,estado")
      .eq("hospital_id", id).in("estado", ["solicitado", "en_transito"]),
  ]);
  return { hospital, insumos: insumos ?? [] };
}

export async function actualizarHospital(id: string, campos: Record<string, any>) {
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of ["nombre", "ubicacion", "contacto", "responsable_recepcion_nombre", "responsable_recepcion_contacto"])
    if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("hospitales").update(limpio).eq("id", id).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, hospital: data };
}

// ── Centros de Acopio ──
const CAMPOS_CENTRO = ["nombre", "zona", "ubicacion", "gps_lat", "gps_lng", "contacto_nombre", "contacto_telefono", "horario", "recibe", "necesita", "activo"];

export async function upsertCentro(campos: Record<string, any>) {
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CENTRO) if (k in campos) limpio[k] = campos[k];
  if (!limpio.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const q = campos.id
    ? s.from("centros_acopio").update(limpio).eq("id", campos.id)
    : s.from("centros_acopio").insert(limpio);
  const { data, error } = await q.select().single();
  return error ? { ok: false, error: error.message } : { ok: true, centro: data };
}

export async function eliminarCentro(id: string) {
  const s = createAdminClient();
  const { error } = await s.from("centros_acopio").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Donación monetaria ──
export async function registrarDonacion(hospitalId: string, monto: number, donante: string) {
  const s = createAdminClient();
  const { data, error } = await s.from("donaciones_monetarias")
    .insert({ hospital_id: hospitalId, monto, donante, moneda: "USD", estado: "registrada" })
    .select().single();
  return error ? { ok: false, error: error.message } : { ok: true, donacion: data };
}
