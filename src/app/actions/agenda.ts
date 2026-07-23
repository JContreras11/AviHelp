"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";
import { miCamionero } from "@/app/actions/camiones";

// LANE T — AGENDA REUSABLE (tabla `agenda`, migración 20260723110000_camiones_calendario.sql):
// UNA sola tabla para dos usos del MISMO calendario:
//   tipo='camionero'  → disponibilidad de choferes (camionero_id)
//   tipo='voluntario' → turnos de voluntarios en centros de apoyo (user_id o persona_nombre)
// Así la presencia por día/centro se cuenta igual para ambos.
// Acceso: logística (admin o miembro de centro de acopio). Un camionero solo gestiona
// SU propia disponibilidad (gate por fila en `camioneros`, sin tocar roles).

const DENEGADO = { ok: false as const, error: "No autorizado (solo logística / centros de acopio)." };
const ESTADOS = ["disponible", "ocupado", "confirmado", "cancelado"];
const CAMPOS_EDITABLES = ["inicio", "fin", "estado", "nota", "centro_id", "hospital_id", "persona_nombre", "camionero_id", "user_id"];

async function esLogistica(): Promise<boolean> {
  const sc = await getScope();
  return sc.admin || sc.centroIds.length > 0;
}

export type TurnoAgenda = {
  id: string; tipo: "camionero" | "voluntario";
  camionero_id: string | null; user_id: string | null; persona_nombre: string | null;
  centro_id: string | null; hospital_id: string | null;
  inicio: string; fin: string | null; estado: string; nota: string | null; created_at: string;
  camionero?: { nombre: string | null } | null;
  centro?: { nombre: string | null } | null;
  hospital?: { nombre: string | null } | null;
};

// Lista turnos de la agenda por rango/centro/tipo. Logística ve todo (con filtros);
// un camionero (sin scope de centro) solo ve su propia disponibilidad.
export async function listarAgenda(filtros: { centroId?: string | null; desde?: string | null; hasta?: string | null; tipo?: "camionero" | "voluntario" | null } = {}): Promise<TurnoAgenda[]> {
  const sc = await getScope();
  if (!sc.uid) return [];
  const logistica = sc.admin || sc.centroIds.length > 0;
  let propioCamioneroId: string | null = null;
  if (!logistica) {
    const cam = await miCamionero();
    if (!cam) return [];
    propioCamioneroId = cam.id;
  }
  const a = createAdminClient();
  let q = a.from("agenda")
    .select(`id, tipo, camionero_id, user_id, persona_nombre, centro_id, hospital_id, inicio, fin, estado, nota, created_at,
      camionero:camionero_id(nombre), centro:centro_id(nombre), hospital:hospital_id(nombre)`)
    .order("inicio", { ascending: true }).limit(500);
  if (propioCamioneroId) q = q.eq("camionero_id", propioCamioneroId);
  if (filtros.tipo) q = q.eq("tipo", filtros.tipo);
  if (filtros.centroId) q = q.eq("centro_id", filtros.centroId);
  if (filtros.desde) q = q.gte("inicio", filtros.desde);
  if (filtros.hasta) q = q.lte("inicio", filtros.hasta);
  const { data } = await q;
  return (data ?? []) as unknown as TurnoAgenda[];
}

export type TurnoPayload = {
  tipo: "camionero" | "voluntario";
  camioneroId?: string | null;   // requerido si tipo='camionero'
  userId?: string | null;        // voluntario con cuenta
  personaNombre?: string | null; // voluntario sin cuenta
  centroId?: string | null;
  hospitalId?: string | null;
  inicio: string;                // ISO
  fin?: string | null;           // ISO
  estado?: string;               // disponible | ocupado | confirmado | cancelado
  nota?: string | null;
};

// Crea un turno/disponibilidad. Logística crea cualquiera; un camionero solo el suyo.
export async function crearTurno(payload: TurnoPayload) {
  const sc = await getScope();
  if (!sc.uid) return DENEGADO;
  if (payload.tipo !== "camionero" && payload.tipo !== "voluntario")
    return { ok: false as const, error: "Tipo de turno inválido." };
  if (!payload.inicio) return { ok: false as const, error: "Indica la fecha/hora de inicio." };
  if (payload.estado && !ESTADOS.includes(payload.estado))
    return { ok: false as const, error: "Estado inválido." };

  const logistica = sc.admin || sc.centroIds.length > 0;
  let camioneroId = payload.camioneroId ?? null;
  if (payload.tipo === "camionero") {
    if (!logistica) {
      // Un camionero registra SU disponibilidad (ignora cualquier otro id que llegue).
      const cam = await miCamionero();
      if (!cam) return DENEGADO;
      camioneroId = cam.id;
    }
    if (!camioneroId) return { ok: false as const, error: "Selecciona el camionero." };
  } else {
    if (!logistica) return DENEGADO;
    if (!payload.userId && !payload.personaNombre?.trim())
      return { ok: false as const, error: "Indica el voluntario (usuario o nombre)." };
  }

  const a = createAdminClient();
  const { data, error } = await a.from("agenda").insert({
    tipo: payload.tipo,
    camionero_id: payload.tipo === "camionero" ? camioneroId : null,
    user_id: payload.tipo === "voluntario" ? (payload.userId ?? null) : null,
    persona_nombre: payload.tipo === "voluntario" ? (payload.personaNombre?.trim() || null) : null,
    centro_id: payload.centroId ?? null,
    hospital_id: payload.hospitalId ?? null,
    inicio: payload.inicio,
    fin: payload.fin ?? null,
    estado: payload.estado ?? "disponible",
    nota: payload.nota?.trim() || null,
  }).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("crear", "agenda", data?.id, { tipo: payload.tipo, inicio: payload.inicio });
  return { ok: true as const, turno: data };
}

// ¿Puede el usuario tocar este turno? Logística siempre; camionero solo el suyo.
async function puedeTocarTurno(turno: { tipo: string; camionero_id: string | null }): Promise<boolean> {
  if (await esLogistica()) return true;
  if (turno.tipo !== "camionero") return false;
  const cam = await miCamionero();
  return !!cam && turno.camionero_id === cam.id;
}

export async function actualizarTurno(id: string, campos: Record<string, any>) {
  const a = createAdminClient();
  const { data: t } = await a.from("agenda").select("id, tipo, camionero_id").eq("id", id).maybeSingle();
  if (!t) return { ok: false as const, error: "Turno no encontrado." };
  if (!(await puedeTocarTurno(t))) return DENEGADO;
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_EDITABLES) if (k in campos) limpio[k] = campos[k];
  if (limpio.estado && !ESTADOS.includes(limpio.estado)) return { ok: false as const, error: "Estado inválido." };
  if (!Object.keys(limpio).length) return { ok: false as const, error: "Nada que actualizar." };
  const { data, error } = await a.from("agenda").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "agenda", id, { estado: data?.estado });
  return { ok: true as const, turno: data };
}

export async function eliminarTurno(id: string) {
  const a = createAdminClient();
  const { data: t } = await a.from("agenda").select("id, tipo, camionero_id").eq("id", id).maybeSingle();
  if (!t) return { ok: false as const, error: "Turno no encontrado." };
  if (!(await puedeTocarTurno(t))) return DENEGADO;
  const { error } = await a.from("agenda").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("eliminar", "agenda", id);
  return { ok: true as const };
}
