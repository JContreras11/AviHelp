"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

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
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "persona", id, { nombre: data?.nombre });
  return { ok: true, persona: data };
}

// Añade una persona a UNA carga propia (botón "➕ Añadir" en Mis Cargas).
// Permitido si: admin, dueño de la carga, o miembro del hospital de la carga.
export async function crearPersona(cargaId: string, campos: Record<string, any>) {
  const sc = await getScope();
  if (!sc.uid) return DENEGADO;
  if (!campos.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const s = createAdminClient();
  const { data: carga } = await s.from("cargas").select("user_id, hospital_id").eq("id", cargaId).single();
  if (!carga) return { ok: false, error: "Carga no encontrada." };
  const hospitalId = carga.hospital_id ?? null;
  const permitido = sc.admin || carga.user_id === sc.uid || (!!hospitalId && sc.hospitalIds.includes(hospitalId));
  if (!permitido) return DENEGADO;
  const limpio: Record<string, any> = { fuente: "manual", carga_id: cargaId, hospital_id: hospitalId };
  for (const k of CAMPOS_PERSONA) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("personas").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "persona", data?.id, { nombre: data?.nombre, carga_id: cargaId });
  return { ok: true, persona: data };
}

export async function eliminarPersona(id: string) {
  const s = createAdminClient();
  const { data: p } = await s.from("personas").select("hospital_id").eq("id", id).single();
  if (!(await gestionaHospital(p?.hospital_id))) return DENEGADO;
  const { error } = await s.from("personas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "persona", id);
  return { ok: true };
}

// ── Insumos ──
export async function getInsumo(id: string) {
  const s = createAdminClient();
  const [{ data: insumo }, { data: eventos }, { data: donaciones }] = await Promise.all([
    s.from("insumos").select("*, hospitales(nombre, ubicacion, gps_lat, gps_lng)").eq("id", id).single(),
    s.from("insumo_eventos").select("*").eq("insumo_id", id).order("created_at", { ascending: false }),
    s.from("donaciones").select("*, centros_acopio(nombre)").eq("insumo_id", id).order("created_at", { ascending: false }),
  ]);
  return { insumo, eventos: eventos ?? [], donaciones: donaciones ?? [] };
}

async function hospitalDeInsumo(s: any, id: string) {
  const { data } = await s.from("insumos").select("hospital_id").eq("id", id).single();
  return data?.hospital_id as string | undefined;
}

// Crea una Necesidad (insumo/ropa/comida/agua…) para una institución del scope del usuario.
export async function crearInsumo(hospitalId: string, campos: Record<string, any>) {
  if (!(await gestionaHospital(hospitalId))) return DENEGADO;
  if (!campos.nombre?.trim()) return { ok: false, error: "El nombre del insumo es obligatorio." };
  const s = createAdminClient();
  const limpio: Record<string, any> = { hospital_id: hospitalId, fuente: "manual" };
  for (const k of ["nombre", "cantidad", "unidad", "presentacion", "area", "para_que_sirve", "alternativas", "prioridad"])
    if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("insumos").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "insumo", data?.id, { nombre: data?.nombre, hospital_id: hospitalId });
  return { ok: true, insumo: data };
}

export async function actualizarInsumo(id: string, campos: Record<string, any>) {
  const s = createAdminClient();
  if (!(await gestionaHospital(await hospitalDeInsumo(s, id)))) return DENEGADO;
  const limpio: Record<string, any> = {};
  for (const k of ["nombre", "cantidad", "unidad", "presentacion", "area", "para_que_sirve", "alternativas", "prioridad", "estado", "donante"])
    if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("insumos").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "insumo", id, { nombre: data?.nombre });
  return { ok: true, insumo: data };
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
  await registrarLog("cubrir", "insumo", id);
  return { ok: true, insumo: data };
}

export async function eliminarInsumo(id: string) {
  const s = createAdminClient();
  if (!(await gestionaHospital(await hospitalDeInsumo(s, id)))) return DENEGADO;
  const { error } = await s.from("insumos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "insumo", id);
  return { ok: true };
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
  await registrarLog("tracking", "insumo", id, { estado });
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
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "hospital", data?.id, { nombre: data?.nombre });
  return { ok: true, hospital: data };
}

export async function actualizarHospital(id: string, campos: Record<string, any>) {
  if (!(await gestionaHospital(id))) return DENEGADO;
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_HOSPITAL) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("hospitales").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "hospital", id, { nombre: data?.nombre });
  return { ok: true, hospital: data };
}

export async function eliminarHospital(id: string) {
  if (!(await esAdmin())) return DENEGADO; // borra insumos/personas en cascada: solo admin
  const s = createAdminClient();
  const { error } = await s.from("hospitales").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "hospital", id);
  return { ok: true };
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
  if (error) return { ok: false, error: error.message };
  await registrarLog(campos.id ? "editar" : "crear", "centro", data?.id, { nombre: data?.nombre });
  return { ok: true, centro: data };
}

export async function eliminarCentro(id: string) {
  if (!(await esAdmin())) return DENEGADO; // borrar institución: solo admin
  const s = createAdminClient();
  const { error } = await s.from("centros_acopio").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "centro", id);
  return { ok: true };
}
