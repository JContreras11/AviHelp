"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// LANE CAL — Calendario general de ASIGNACIONES de voluntarios (tabla `asignaciones`,
// migración 20260723140000_calendario_asignaciones.sql). Tablero tipo Google Calendar:
//   estado 'disponible'/'tentativo' → AMARILLO   'asignado' → VERDE
// Acceso: logística (admin o miembro de centro de acopio). La tabla `voluntarios` solo se LEE.
// Al CONFIRMAR una asignación (→ 'asignado') se sincroniza invitación a Google Calendar
// (stub tras feature-flag) y se genera un .ics funcional como respaldo.

const DENEGADO = { ok: false as const, error: "No autorizado (solo logística / centros de acopio)." };
const ESTADOS = ["disponible", "tentativo", "asignado", "cancelado"];
const CAMPOS_EDITABLES = ["fecha", "estado", "notas", "voluntario_id", "org_id"];

async function esLogistica(): Promise<{ ok: boolean; admin: boolean; centroIds: string[]; uid: string | null }> {
  const sc = await getScope();
  return { ok: sc.admin || sc.centroIds.length > 0, admin: sc.admin, centroIds: sc.centroIds, uid: sc.uid };
}

export type Asignacion = {
  id: string;
  voluntario_id: string | null;
  fecha: string;            // YYYY-MM-DD
  estado: string;           // disponible | tentativo | asignado | cancelado
  org_id: string | null;
  notas: string | null;
  created_at: string;
  voluntario?: { nombre: string | null } | null;
};

// Lista asignaciones en un rango de fechas (incluye el nombre del voluntario para pintarlo por día).
export async function listarAsignaciones(filtros: { desde?: string | null; hasta?: string | null } = {}): Promise<Asignacion[]> {
  const g = await esLogistica();
  if (!g.ok) return [];
  const a = createAdminClient();
  let q = a.from("asignaciones")
    .select("id, voluntario_id, fecha, estado, org_id, notas, created_at, voluntario:voluntario_id(nombre)")
    .order("fecha", { ascending: true }).limit(1000);
  if (filtros.desde) q = q.gte("fecha", filtros.desde);
  if (filtros.hasta) q = q.lte("fecha", filtros.hasta);
  const { data } = await q;
  return (data ?? []) as unknown as Asignacion[];
}

// Voluntarios activos para el selector del calendario (solo LECTURA de la tabla `voluntarios`).
export async function listarVoluntariosParaCalendario(): Promise<{ id: string; nombre: string }[]> {
  const g = await esLogistica();
  if (!g.ok) return [];
  const a = createAdminClient();
  const { data } = await a.from("voluntarios")
    .select("id, nombre").eq("estado", "activo").order("nombre", { ascending: true }).limit(500);
  return (data ?? []) as { id: string; nombre: string }[];
}

export type AsignacionPayload = {
  voluntarioId: string;
  fecha: string;            // YYYY-MM-DD
  estado?: string;
  orgId?: string | null;
  notas?: string | null;
};

export async function crearAsignacion(payload: AsignacionPayload) {
  const g = await esLogistica();
  if (!g.ok) return DENEGADO;
  if (!payload.voluntarioId) return { ok: false as const, error: "Selecciona el voluntario." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.fecha ?? "")) return { ok: false as const, error: "Indica el día de la asignación." };
  if (payload.estado && !ESTADOS.includes(payload.estado)) return { ok: false as const, error: "Estado inválido." };

  const a = createAdminClient();
  const { data: v } = await a.from("voluntarios").select("id, nombre").eq("id", payload.voluntarioId).maybeSingle();
  if (!v) return { ok: false as const, error: "Voluntario no encontrado." };

  // org_id por defecto: primer centro del usuario (multi-tenant a futuro; admin puede quedar null).
  const orgId = payload.orgId ?? g.centroIds[0] ?? null;
  const { data, error } = await a.from("asignaciones").insert({
    voluntario_id: v.id,
    fecha: payload.fecha,
    estado: payload.estado ?? "tentativo",
    org_id: orgId,
    notas: payload.notas?.trim() || null,
  }).select("id").single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("crear", "asignacion", data?.id, { voluntario_id: v.id, fecha: payload.fecha });
  return { ok: true as const, id: data?.id as string };
}

// Actualiza campos permitidos. Usado también por el DRAG-AND-DROP (solo cambia `fecha`).
export async function actualizarAsignacion(id: string, campos: Record<string, any>) {
  const g = await esLogistica();
  if (!g.ok) return DENEGADO;
  const a = createAdminClient();
  const { data: existe } = await a.from("asignaciones").select("id").eq("id", id).maybeSingle();
  if (!existe) return { ok: false as const, error: "Asignación no encontrada." };
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_EDITABLES) if (k in campos) limpio[k] = campos[k];
  if (limpio.estado && !ESTADOS.includes(limpio.estado)) return { ok: false as const, error: "Estado inválido." };
  if ("fecha" in limpio && !/^\d{4}-\d{2}-\d{2}$/.test(limpio.fecha)) return { ok: false as const, error: "Fecha inválida." };
  if (!Object.keys(limpio).length) return { ok: false as const, error: "Nada que actualizar." };
  const { data, error } = await a.from("asignaciones").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "asignacion", id, { campos: Object.keys(limpio) });
  return { ok: true as const, asignacion: data as Asignacion };
}

// Mueve una asignación a otra fecha (drag-and-drop estilo Google Calendar).
export async function moverAsignacion(id: string, fecha: string) {
  return actualizarAsignacion(id, { fecha });
}

export async function eliminarAsignacion(id: string) {
  const g = await esLogistica();
  if (!g.ok) return DENEGADO;
  const a = createAdminClient();
  const { error } = await a.from("asignaciones").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("eliminar", "asignacion", id);
  return { ok: true as const };
}

// ── Task 21 — Confirmar asignación + sincronizar Google Calendar ──
// Al confirmar (estado → 'asignado') se envía invitación a los involucrados. Si NO hay
// credenciales OAuth, la sincronización queda tras un stub y se genera un .ics funcional.
export async function confirmarAsignacion(id: string) {
  const g = await esLogistica();
  if (!g.ok) return DENEGADO;
  const a = createAdminClient();
  const { data: asig } = await a.from("asignaciones")
    .select("id, voluntario_id, fecha, org_id, notas, voluntario:voluntario_id(nombre)")
    .eq("id", id).maybeSingle();
  if (!asig) return { ok: false as const, error: "Asignación no encontrada." };

  const { error } = await a.from("asignaciones").update({ estado: "asignado" }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("confirmar", "asignacion", id, { fecha: (asig as any).fecha });

  const nombre = ((asig as any).voluntario?.nombre as string) ?? "Voluntario";
  const asistentes = await correosInvolucrados(a, (asig as any).voluntario_id, (asig as any).org_id);
  const sync = await sincronizarGoogleCalendar({
    resumen: `Turno de voluntariado — ${nombre}`,
    fecha: (asig as any).fecha as string,
    descripcion: ((asig as any).notas as string) || "Asignación confirmada en el calendario de AviHelp.",
    asistentes,
  });

  return { ok: true as const, sincronizado: sync.enviado, ics: sync.ics, icsNombre: sync.icsNombre, asistentes };
}

// Correos de: voluntario (perfil ligado), administradores y habilitados del centro (membresías aprobadas).
async function correosInvolucrados(a: ReturnType<typeof createAdminClient>, voluntarioId: string | null, orgId: string | null): Promise<string[]> {
  const correos = new Set<string>();
  try {
    if (voluntarioId) {
      const { data: v } = await a.from("voluntarios").select("user_id").eq("id", voluntarioId).maybeSingle();
      if (v?.user_id) {
        const { data: p } = await a.from("profiles").select("email").eq("id", v.user_id).maybeSingle();
        if (p?.email) correos.add(p.email);
      }
    }
    const { data: admins } = await a.from("profiles").select("email").eq("rol", "admin");
    for (const p of admins ?? []) if (p.email) correos.add(p.email);
    if (orgId) {
      const { data: mem } = await a.from("membresias")
        .select("user_id, estado").eq("estado", "aprobado").or(`centro_id.eq.${orgId},hospital_id.eq.${orgId}`);
      const uids = (mem ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (uids.length) {
        const { data: ps } = await a.from("profiles").select("email").in("id", uids);
        for (const p of ps ?? []) if (p.email) correos.add(p.email);
      }
    }
  } catch {
    // best-effort: la lista de asistentes no debe bloquear la confirmación.
  }
  return [...correos];
}

// ponytail: stub, conectar Google Calendar API cuando haya OAuth.
// Sin credenciales OAuth (GOOGLE_OAUTH_CLIENT_ID/SECRET) no se envía la invitación real;
// se genera un .ics estándar (RFC 5545) que cualquiera puede importar a Google Calendar.
async function sincronizarGoogleCalendar(evt: { resumen: string; fecha: string; descripcion: string; asistentes: string[] }): Promise<{ enviado: boolean; ics: string; icsNombre: string }> {
  const ics = generarICS(evt);
  const icsNombre = `asignacion-${evt.fecha}.ics`;
  const hayOAuth = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  if (!hayOAuth) {
    return { enviado: false, ics, icsNombre };
  }
  // ponytail: stub, conectar Google Calendar API cuando haya OAuth.
  // Aquí iría events.insert con sendUpdates='all' y attendees = evt.asistentes.
  return { enviado: false, ics, icsNombre };
}

// Genera un evento .ics (RFC 5545) de día completo con los asistentes como ATTENDEE.
function generarICS(evt: { resumen: string; fecha: string; descripcion: string; asistentes: string[] }): string {
  const dt = evt.fecha.replace(/-/g, "");                       // YYYYMMDD
  const fin = new Date(`${evt.fecha}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  const dtEnd = `${fin.getUTCFullYear()}${String(fin.getUTCMonth() + 1).padStart(2, "0")}${String(fin.getUTCDate()).padStart(2, "0")}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const uid = `${dt}-${Math.random().toString(36).slice(2)}@avihelp`;
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AviHelp//Calendario//ES",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${esc(evt.resumen)}`,
    `DESCRIPTION:${esc(evt.descripcion)}`,
    ...evt.asistentes.map((c) => `ATTENDEE;RSVP=TRUE;CN=${esc(c)}:mailto:${c}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lineas.join("\r\n");
}
