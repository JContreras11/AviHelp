"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";

// ── Alcance (seguridad) ──
// service_role salta RLS, así que cada mutación verifica el alcance del usuario:
// admin gestiona todo; el resto solo las instituciones donde es miembro.
const DENEGADO = { ok: false as const, error: "No tienes permiso sobre esta institución." };

async function gestionaHospital(hospitalId: string | null | undefined) {
  const sc = await getScope();
  if (sc.admin) return true;
  return !!hospitalId && sc.hospitalIds.includes(hospitalId);
}
async function gestionaCentro(centroId: string | null | undefined) {
  const sc = await getScope();
  if (sc.admin) return true;
  return !!centroId && sc.centroIds.includes(centroId);
}
async function esAdmin() {
  return (await getScope()).admin;
}

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
  const { data: p } = await s.from("personas").select("hospital_id").eq("id", id).single();
  if (!(await gestionaHospital(p?.hospital_id))) return DENEGADO;
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_PERSONA) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("personas").update(limpio).eq("id", id).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, persona: data };
}

export async function eliminarPersona(id: string) {
  const s = createAdminClient();
  const { data: p } = await s.from("personas").select("hospital_id").eq("id", id).single();
  if (!(await gestionaHospital(p?.hospital_id))) return DENEGADO;
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

async function hospitalDeInsumo(s: any, id: string) {
  const { data } = await s.from("insumos").select("hospital_id").eq("id", id).single();
  return data?.hospital_id as string | undefined;
}

export async function actualizarInsumo(id: string, campos: Record<string, any>) {
  const s = createAdminClient();
  if (!(await gestionaHospital(await hospitalDeInsumo(s, id)))) return DENEGADO;
  const limpio: Record<string, any> = {};
  for (const k of ["nombre", "cantidad", "unidad", "presentacion", "area", "para_que_sirve", "alternativas", "prioridad", "estado", "donante"])
    if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("insumos").update(limpio).eq("id", id).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, insumo: data };
}

// "Cubierto": el hospital/área verifica que recibió el insumo -> sale de la lista activa.
export async function cubrirInsumo(id: string, por?: string, nota?: string) {
  const s = createAdminClient();
  if (!(await gestionaHospital(await hospitalDeInsumo(s, id)))) return DENEGADO;
  const { data, error } = await s.from("insumos")
    .update({ estado: "cubierto", cubierto_at: new Date().toISOString(), cubierto_por: por ?? null })
    .eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await s.from("insumo_eventos").insert({ insumo_id: id, estado: "cubierto", actor: por, nota: nota ?? "Recibido/verificado" });
  return { ok: true, insumo: data };
}

export async function eliminarInsumo(id: string) {
  const s = createAdminClient();
  if (!(await gestionaHospital(await hospitalDeInsumo(s, id)))) return DENEGADO;
  const { error } = await s.from("insumos").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Cambia estado del insumo (solicitado -> en_transito -> entregado) + registra evento de tracking.
export async function cambiarEstadoInsumo(id: string, estado: string, actor?: string, nota?: string) {
  const s = createAdminClient();
  if (!(await gestionaHospital(await hospitalDeInsumo(s, id)))) return DENEGADO;
  // Al salir de "cubierto" (corregir un clic erróneo) se limpian sus marcas.
  const { data, error } = await s.from("insumos")
    .update({ estado, ...(actor ? { donante: actor } : {}), ...(estado !== "cubierto" ? { cubierto_at: null, cubierto_por: null } : {}) })
    .eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await s.from("insumo_eventos").insert({ insumo_id: id, estado, actor, nota });
  return { ok: true, insumo: data };
}

// ── Hospitales / clínicas ──
const CAMPOS_HOSPITAL = ["nombre", "tipo", "ubicacion", "gps_lat", "gps_lng", "contacto", "responsable_recepcion_nombre", "responsable_recepcion_contacto"];

export async function getHospital(id: string) {
  const s = createAdminClient();
  const [{ data: hospital }, { data: insumos }] = await Promise.all([
    s.from("hospitales").select("*").eq("id", id).single(),
    s.from("insumos").select("id,nombre,cantidad,unidad,presentacion,area,prioridad,estado")
      .eq("hospital_id", id).in("estado", ["solicitado", "en_transito"]),
  ]);
  return { hospital, insumos: insumos ?? [] };
}

export async function crearHospital(campos: Record<string, any>) {
  if (!(await esAdmin())) return DENEGADO; // crear una institución es acto de admin
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_HOSPITAL) if (k in campos) limpio[k] = campos[k];
  if (!limpio.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const { data, error } = await s.from("hospitales").insert(limpio).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, hospital: data };
}

export async function actualizarHospital(id: string, campos: Record<string, any>) {
  if (!(await gestionaHospital(id))) return DENEGADO;
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_HOSPITAL) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("hospitales").update(limpio).eq("id", id).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, hospital: data };
}

export async function eliminarHospital(id: string) {
  if (!(await esAdmin())) return DENEGADO; // borra insumos/personas en cascada: solo admin
  const s = createAdminClient();
  const { error } = await s.from("hospitales").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Centros de Acopio ──
const CAMPOS_CENTRO = ["nombre", "zona", "ubicacion", "gps_lat", "gps_lng", "contacto_nombre", "contacto_telefono", "horario", "recibe", "necesita", "activo"];

export async function upsertCentro(campos: Record<string, any>) {
  // Crear centro = admin. Editar uno existente = admin o miembro del centro.
  if (campos.id ? !(await gestionaCentro(campos.id)) : !(await esAdmin())) return DENEGADO;
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
  if (!(await esAdmin())) return DENEGADO; // borrar institución: solo admin
  const s = createAdminClient();
  const { error } = await s.from("centros_acopio").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
