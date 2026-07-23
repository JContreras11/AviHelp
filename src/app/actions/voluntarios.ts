"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";
import {
  AREAS_CONOCIMIENTO, DISPONIBILIDAD, FRECUENCIA, DURACION_TURNO, POSTULACION,
  TURNOS_CRONOGRAMA, TURNO_HORARIO, ESTADOS_VOLUNTARIO,
  type EstadoVoluntario, type FilaCronograma, type TurnoCronograma,
  type Voluntario, type VoluntarioPayload,
} from "@/lib/voluntarios";

// LANE V — Voluntarios (personal de salud). Add-only.
// - REGISTRO público (/voluntarios/registro): replica el Google Form de la Fundación
//   Agua Verde → crearVoluntario SIN sesión, siempre estado='pendiente'.
// - ROSTER (/voluntarios): logística (admin o miembro de centro de acopio) gestiona
//   la lista, aprueba (pendiente→activo) y AGENDA turnos del cronograma médico.
// - CRONOGRAMA: los turnos van a la tabla `agenda` (LANE T) con tipo='voluntario' +
//   voluntario_id/especialidad/turno (columnas de la migración 20260723120000).

const DENEGADO = { ok: false as const, error: "No autorizado (solo logística / centros de acopio)." };

async function esLogistica(): Promise<boolean> {
  const sc = await getScope();
  return sc.admin || sc.centroIds.length > 0;
}

// Campos que la logística puede editar del perfil (whitelist anti-inyección).
const CAMPOS_EDITABLES = [
  "nombre", "cedula", "edad", "telefono", "estado_residencia", "contacto_emergencia",
  "area_conocimiento", "especialidad", "mpps", "disponibilidad", "frecuencia",
  "duracion_turno", "transporte_propio", "postulacion", "grupo_sanguineo", "alergias",
  "centro_id",
];

// ── REGISTRO PÚBLICO (auto-registro, como el Google Form; sin sesión) ──
// `archivo` (opcional): FormData con la constancia/carta bajo la clave "constancia"
// (para quien no tiene MPPS). Se sube al bucket `fotos` en voluntarios/.
export async function crearVoluntario(payload: VoluntarioPayload, archivo?: FormData | null) {
  // Validación de los campos OBLIGATORIOS del formulario (mismos * del Google Form).
  const nombre = payload?.nombre?.trim();
  if (!nombre) return { ok: false as const, error: "Escribe tu nombre y apellido." };
  if (!payload.cedula?.trim()) return { ok: false as const, error: "Escribe tu cédula de identidad." };
  const edad = payload.edad != null && Number.isFinite(Number(payload.edad)) ? Math.floor(Number(payload.edad)) : null;
  if (edad == null || edad < 16 || edad > 100) return { ok: false as const, error: "Indica una edad válida." };
  if (!payload.telefono?.trim()) return { ok: false as const, error: "Escribe tu número de teléfono." };
  if (!payload.estado_residencia?.trim()) return { ok: false as const, error: "Indica el estado donde vives actualmente." };
  if (!payload.contacto_emergencia?.trim()) return { ok: false as const, error: "Indica tu contacto en caso de emergencia (nombre + parentesco)." };
  if (!payload.area_conocimiento?.trim()) return { ok: false as const, error: "Selecciona tu área de conocimiento." };
  if (!(DISPONIBILIDAD as readonly string[]).includes(payload.disponibilidad))
    return { ok: false as const, error: "Selecciona tu disponibilidad de tiempo." };
  if (!(FRECUENCIA as readonly string[]).includes(payload.frecuencia))
    return { ok: false as const, error: "Selecciona la frecuencia de voluntariado." };
  if (!(DURACION_TURNO as readonly string[]).includes(payload.duracion_turno))
    return { ok: false as const, error: "Selecciona la duración de turnos." };
  if (payload.transporte_propio == null)
    return { ok: false as const, error: "Indica si cuentas con transporte personal." };
  if (!(POSTULACION as readonly string[]).includes(payload.postulacion))
    return { ok: false as const, error: "Indica cómo te postulas." };
  if (!payload.grupo_sanguineo?.trim()) return { ok: false as const, error: "Indica tu grupo sanguíneo." };
  if (!payload.alergias?.trim())
    return { ok: false as const, error: "Indica alergias o condiciones médicas importantes (escribe \"Ninguna\" si no aplica)." };

  // El área debe ser una de las opciones del formulario; "Otro" viaja como texto libre
  // desde la UI ("Otro: …"), así que solo se valida el prefijo.
  const area = payload.area_conocimiento.trim();
  const areaValida = (AREAS_CONOCIMIENTO as readonly string[]).includes(area) || area.startsWith("Otro");
  if (!areaValida) return { ok: false as const, error: "Área de conocimiento inválida." };

  const a = createAdminClient();

  // Constancia opcional (quien no tiene MPPS adjunta carta/constancia) → bucket `fotos`.
  let constancia_path: string | null = null;
  const f = archivo?.get("constancia");
  if (f instanceof File && f.size > 0) {
    if (f.size > 10 * 1024 * 1024) return { ok: false as const, error: "La constancia no puede pesar más de 10 MB." };
    const buf = Buffer.from(await f.arrayBuffer());
    const ext = (f.name.split(".").pop() || f.type.split("/")[1] || "pdf").toLowerCase().replace("jpeg", "jpg").slice(0, 8);
    const path = `voluntarios/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await a.storage.from("fotos").upload(path, buf, {
      contentType: f.type || "application/octet-stream", upsert: false,
    });
    if (!upErr) constancia_path = path;
  }

  // Si hay sesión, liga el perfil al usuario (auto-registro logueado); si no, queda null.
  const sc = await getScope();

  const { data, error } = await a.from("voluntarios").insert({
    nombre,
    cedula: payload.cedula.trim(),
    edad,
    telefono: payload.telefono.trim(),
    estado_residencia: payload.estado_residencia.trim(),
    contacto_emergencia: payload.contacto_emergencia.trim(),
    area_conocimiento: area,
    especialidad: payload.especialidad?.trim() || null,
    mpps: payload.mpps?.trim() || null,
    constancia_path,
    disponibilidad: payload.disponibilidad,
    frecuencia: payload.frecuencia,
    duracion_turno: payload.duracion_turno,
    transporte_propio: !!payload.transporte_propio,
    postulacion: payload.postulacion,
    grupo_sanguineo: payload.grupo_sanguineo.trim(),
    alergias: payload.alergias.trim(),
    user_id: sc.uid ?? null,
    estado: "pendiente", // SIEMPRE pendiente: la logística aprueba desde el roster.
  }).select("id, created_at").single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "No se pudo registrar el voluntario." };

  await registrarLog("registro", "voluntario", data.id, { nombre, area });
  return { ok: true as const, id: data.id as string };
}

// ── ROSTER (logística) ──
export async function listarVoluntarios(filtros: { estado?: string | null; area?: string | null; q?: string | null } = {}): Promise<Voluntario[]> {
  if (!(await esLogistica())) return [];
  const a = createAdminClient();
  let q = a.from("voluntarios").select("*").order("created_at", { ascending: false }).limit(500);
  if (filtros.estado && (ESTADOS_VOLUNTARIO as readonly string[]).includes(filtros.estado)) q = q.eq("estado", filtros.estado);
  if (filtros.area) q = q.eq("area_conocimiento", filtros.area);
  if (filtros.q?.trim()) {
    const s = filtros.q.replace(/[%,()]/g, " ").trim();
    q = q.or(`nombre.ilike.%${s}%,cedula.ilike.%${s}%,especialidad.ilike.%${s}%`);
  }
  const { data } = await q;
  return (data ?? []) as Voluntario[];
}

export async function getVoluntario(id: string): Promise<Voluntario | null> {
  if (!(await esLogistica())) return null;
  const a = createAdminClient();
  const { data } = await a.from("voluntarios").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as Voluntario | null;
}

export async function actualizarVoluntario(id: string, campos: Record<string, any>) {
  if (!(await esLogistica())) return DENEGADO;
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_EDITABLES) if (k in campos) limpio[k] = campos[k];
  if (!Object.keys(limpio).length) return { ok: false as const, error: "Nada que actualizar." };
  const a = createAdminClient();
  const { data, error } = await a.from("voluntarios").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "voluntario", id, { campos: Object.keys(limpio) });
  return { ok: true as const, voluntario: data as Voluntario };
}

export async function cambiarEstadoVoluntario(id: string, estado: EstadoVoluntario) {
  if (!(await esLogistica())) return DENEGADO;
  if (!(ESTADOS_VOLUNTARIO as readonly string[]).includes(estado))
    return { ok: false as const, error: "Estado inválido." };
  const a = createAdminClient();
  const { data, error } = await a.from("voluntarios").update({ estado }).eq("id", id).select("id, nombre, estado").single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("estado", "voluntario", id, { estado });
  return { ok: true as const, voluntario: data };
}

export async function eliminarVoluntario(id: string) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const { error } = await a.from("voluntarios").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("eliminar", "voluntario", id);
  return { ok: true as const };
}

// ── CRONOGRAMA MÉDICO (agenda tipo='voluntario') ──

export type AgendarTurnoPayload = {
  voluntarioId: string;
  fecha: string;               // YYYY-MM-DD (día del cronograma)
  turno: TurnoCronograma;      // AM | PM | 12 | 24 | 48 (columna Turno del Excel)
  centroId?: string | null;    // centro/sede donde cubre el turno
  nota?: string | null;
};

// "Agendar turno": crea la fila del CRONOGRAMA en `agenda` (tabla de LANE T) con
// tipo='voluntario' + voluntario_id/especialidad/turno. Insert directo (crearTurno de
// agenda.ts vive en otra lane no fusionada aún; el insert usa exactamente el mismo shape,
// y rellena persona_nombre para que el /calendario existente también lo pinte).
export async function agendarTurnoVoluntario(payload: AgendarTurnoPayload) {
  if (!(await esLogistica())) return DENEGADO;
  if (!payload.voluntarioId) return { ok: false as const, error: "Selecciona el voluntario." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.fecha ?? "")) return { ok: false as const, error: "Indica el día del turno." };
  if (!(TURNOS_CRONOGRAMA as readonly string[]).includes(payload.turno))
    return { ok: false as const, error: "Turno inválido (AM, PM, 12, 24 o 48)." };

  const a = createAdminClient();
  const { data: v } = await a.from("voluntarios")
    .select("id, nombre, especialidad, area_conocimiento, estado").eq("id", payload.voluntarioId).maybeSingle();
  if (!v) return { ok: false as const, error: "Voluntario no encontrado." };
  if (v.estado !== "activo") return { ok: false as const, error: "Activa al voluntario antes de agendarlo (está " + v.estado + ")." };

  // Deriva inicio/fin del turno (AM 07-13, PM 13-19, 12/24/48 h desde las 07:00),
  // así el turno también aparece en el /calendario semanal por rango de fechas.
  const { horaInicio, horas } = TURNO_HORARIO[payload.turno];
  const inicio = new Date(`${payload.fecha}T${String(horaInicio).padStart(2, "0")}:00:00`);
  if (Number.isNaN(inicio.getTime())) return { ok: false as const, error: "Fecha inválida." };
  const fin = new Date(inicio.getTime() + horas * 3600_000);

  const { data, error } = await a.from("agenda").insert({
    tipo: "voluntario",
    voluntario_id: v.id,
    persona_nombre: v.nombre,                                  // compat con el calendario de LANE T
    especialidad: v.especialidad || v.area_conocimiento || null, // columna Especialidad del Excel
    turno: payload.turno,                                        // columna Turno del Excel
    centro_id: payload.centroId ?? null,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    estado: "confirmado",
    nota: payload.nota?.trim() || null,
  }).select("id").single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("agendar", "agenda", data?.id, { voluntario_id: v.id, turno: payload.turno, fecha: payload.fecha });
  return { ok: true as const, id: data?.id as string };
}

export async function eliminarTurnoCronograma(id: string) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const { error } = await a.from("agenda").delete().eq("id", id).eq("tipo", "voluntario");
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("eliminar", "agenda", id, { via: "cronograma" });
  return { ok: true as const };
}

// Turnos del cronograma en un rango (grilla semanal Días × Nombre·Especialidad·Turno).
// Lectura para personal interno: logística U hospitales (el cronograma médico es de todos).
export async function listarCronograma(desde: string, hasta: string): Promise<FilaCronograma[]> {
  const sc = await getScope();
  const interno = sc.admin || sc.centroIds.length > 0 || sc.hospitalIds.length > 0;
  if (!interno) return [];
  const a = createAdminClient();
  const { data } = await a.from("agenda")
    .select(`id, inicio, fin, estado, turno, especialidad, persona_nombre, voluntario_id,
      voluntario:voluntario_id(nombre, especialidad, area_conocimiento), centro:centro_id(nombre)`)
    .eq("tipo", "voluntario")
    .gte("inicio", desde).lte("inicio", hasta)
    .order("inicio", { ascending: true }).limit(500);
  return (data ?? []) as unknown as FilaCronograma[];
}
