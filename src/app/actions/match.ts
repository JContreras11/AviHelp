"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { sugerirAsignacion, type NecesidadCtx } from "@/lib/ai/match";

// Acciones de MATCH (triage donación↔necesidad): sugerir, aprobar, rechazar, listar.
// Separadas de ofertas.ts para que los agentes de Donaciones y Solicitudes no editen
// el mismo archivo. Sin cambio de comportamiento (movimiento puro).

// Construye el contexto de necesidades activas (por hospital) y pide a la IA las sugerencias.
export async function sugerirMatches(ofertaId: string): Promise<number> {
  const a = createAdminClient();
  const { data: oferta } = await a.from("ofertas").select("*").eq("id", ofertaId).single();
  if (!oferta) return 0;

  const [{ data: insumos }, { data: personas }] = await Promise.all([
    a.from("insumos").select("id,nombre,cantidad,area,prioridad,hospital_id,hospitales(nombre,ubicacion)")
      .in("estado", ["solicitado", "en_transito"]).limit(500),
    a.from("personas").select("hospital_id").not("hospital_id", "is", null).limit(5000),
  ]);
  const personasPorHosp = new Map<string, number>();
  for (const p of personas ?? []) personasPorHosp.set(p.hospital_id, (personasPorHosp.get(p.hospital_id) ?? 0) + 1);

  const porHosp = new Map<string, NecesidadCtx>();
  for (const i of insumos ?? []) {
    if (!i.hospital_id) continue;
    let h = porHosp.get(i.hospital_id);
    if (!h) {
      h = { hospital_id: i.hospital_id, hospital: (i as any).hospitales?.nombre ?? "Hospital", ubicacion: (i as any).hospitales?.ubicacion ?? null, criticos: 0, personas: personasPorHosp.get(i.hospital_id) ?? 0, insumos: [] };
      porHosp.set(i.hospital_id, h);
    }
    if (i.prioridad === "critica" || i.prioridad === "alta") h.criticos++;
    h.insumos.push({ insumo_id: i.id, nombre: i.nombre, cantidad: i.cantidad, area: i.area, prioridad: i.prioridad });
  }
  const necesidades = [...porHosp.values()];
  const sugerencias = await sugerirAsignacion(
    { tipo: oferta.tipo, descripcion: oferta.descripcion, cantidad: oferta.cantidad, ubicacion_actual: oferta.ubicacion_actual },
    necesidades,
  );
  if (!sugerencias.length) return 0;
  // Reemplaza sugerencias previas no resueltas de esta oferta.
  await a.from("match_sugerencias").delete().eq("oferta_id", ofertaId).eq("estatus", "sugerido");
  const filas = sugerencias.map((s) => ({ oferta_id: ofertaId, hospital_id: s.hospital_id, insumo_id: s.insumo_id, cantidad_sugerida: s.cantidad_sugerida, razon: s.razon }));
  const { error } = await a.from("match_sugerencias").insert(filas);
  return error ? 0 : filas.length;
}

// Cola de triage: sugerencias pendientes. admin ve todas; miembro solo las de sus hospitales.
export async function listarTriage() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  let q = a.from("match_sugerencias")
    .select("*, ofertas(*), hospitales(nombre, responsable_recepcion_nombre, responsable_recepcion_contacto), insumos(nombre, area)")
    .eq("estatus", "sugerido").order("created_at", { ascending: false });
  if (!sc.admin) {
    if (!sc.hospitalIds.length) return [];
    q = q.in("hospital_id", sc.hospitalIds);
  }
  const { data } = await q;
  return data ?? [];
}

// TABLERO DE CONCILIACIÓN (el "match view" real): necesidades activas + las entregas/donaciones
// en curso que las cubren, con banderas accionables. Scope por rol (admin=todo). Reemplaza el
// Triage muerto que dependía de match_sugerencias (0 filas). Datos 100% reales del ciclo.
export async function listarConciliacion() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  let q = a.from("insumos")
    .select("id,nombre,area,prioridad,estado,cantidad,cantidad_en_camino,cantidad_recibida,hospital_id,hospitales(nombre,ubicacion)")
    .in("estado", ["solicitado", "en_transito"]).limit(500);
  if (!sc.admin) {
    if (!sc.hospitalIds.length) return [];
    q = q.in("hospital_id", sc.hospitalIds);
  }
  const { data: insumos } = await q;
  if (!insumos?.length) return [];
  const ids = insumos.map((i: any) => i.id);
  const { data: ents } = await a.from("entregas")
    .select("id,codigo,estado,cantidad,insumo_id,entrega_nombre,nota,updated_at")
    .in("insumo_id", ids).order("updated_at", { ascending: false });
  const byInsumo = new Map<string, any[]>();
  for (const e of ents ?? []) {
    if (!byInsumo.has(e.insumo_id)) byInsumo.set(e.insumo_id, []);
    byInsumo.get(e.insumo_id)!.push(e);
  }
  const RANGO: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  const now = Date.now();
  const TERM = ["recibido", "rechazado", "cancelado"];
  const filas = insumos.map((i: any) => {
    const es = byInsumo.get(i.id) ?? [];
    const enCamino = i.cantidad_en_camino ?? 0, recibida = i.cantidad_recibida ?? 0;
    const critico = i.prioridad === "critica" || i.prioridad === "alta";
    const flags = {
      sinCobertura: critico && enCamino === 0 && recibida === 0,
      discrepancia: es.some((e) => (e.nota ?? "").includes("Confirmado a ~")),
      rechazadas: es.filter((e) => e.estado === "rechazado").length,
      estancada: es.some((e) => !TERM.includes(e.estado) && e.updated_at && now - new Date(e.updated_at).getTime() > 3 * 864e5),
    };
    const activasEnCurso = es.filter((e) => !TERM.includes(e.estado)).length;
    return { id: i.id, nombre: i.nombre, area: i.area, prioridad: i.prioridad, hospital_id: i.hospital_id, hospitalNombre: i.hospitales?.nombre ?? "—", solicitada: i.cantidad ?? 0, enCamino, recibida, entregas: es, activasEnCurso, flags };
  });
  // Orden: atención primero — sin cobertura crítica, luego banderas, luego prioridad.
  const score = (f: any) => (f.flags.sinCobertura ? 0 : f.flags.discrepancia || f.flags.estancada || f.flags.rechazadas ? 1 : 2);
  return filas.sort((x: any, y: any) => score(x) - score(y) || (RANGO[x.prioridad] ?? 2) - (RANGO[y.prioridad] ?? 2));
}

async function puedeAprobar(hospitalId: string | null) {
  const sc = await getScope();
  return sc.admin || (!!hospitalId && sc.hospitalIds.includes(hospitalId));
}

// Aprobar: reserva la oferta + notifica a oferente y al hospital (cierre de ciclo).
export async function aprobarMatch(id: string) {
  const a = createAdminClient();
  const { data: m } = await a.from("match_sugerencias")
    .select("*, ofertas(*), hospitales(nombre, responsable_recepcion_nombre, responsable_recepcion_contacto)")
    .eq("id", id).single();
  if (!m) return { ok: false, error: "Sugerencia no encontrada." };
  if (!(await puedeAprobar(m.hospital_id))) return { ok: false, error: "No tienes permiso sobre este hospital." };
  const sc = await getScope();

  await a.from("match_sugerencias").update({ estatus: "aprobado", aprobado_por: sc.uid }).eq("id", id);
  await a.from("ofertas").update({ estatus: "reservado" }).eq("id", m.oferta_id);

  const of: any = m.ofertas, hosp: any = m.hospitales;
  const respo = [hosp?.responsable_recepcion_nombre, hosp?.responsable_recepcion_contacto].filter(Boolean).join(" · ") || "el responsable del centro";

  // Al oferente (si tiene cuenta).
  if (of?.usuario_oferente_id) {
    await a.from("notificaciones").insert({
      usuario_destino_id: of.usuario_oferente_id,
      mensaje: `Tu oferta (${of.descripcion}) fue aceptada por ${hosp?.nombre ?? "un hospital"}. Comunícate con ${respo} para coordinar la entrega.`,
    });
  }
  // A los miembros del hospital.
  const { data: miembros } = await a.from("membresias").select("user_id").eq("hospital_id", m.hospital_id);
  const oferContacto = [of?.contacto_nombre, of?.contacto_telefono].filter(Boolean).join(" · ") || "ver oferta";
  if (miembros?.length) {
    await a.from("notificaciones").insert(miembros.map((mb: any) => ({
      usuario_destino_id: mb.user_id,
      necesidad_id: m.insumo_id,
      mensaje: `Se reservó una donación externa para tu centro: ${of?.descripcion ?? "una donación"}${m.cantidad_sugerida ? ` (${m.cantidad_sugerida} und. asignadas)` : ""}. Contacto del oferente: ${oferContacto}.`,
    })));
  }
  return { ok: true };
}

export async function rechazarMatch(id: string) {
  const a = createAdminClient();
  const { data: m } = await a.from("match_sugerencias").select("hospital_id").eq("id", id).single();
  if (!m) return { ok: false, error: "No encontrada." };
  if (!(await puedeAprobar(m.hospital_id))) return { ok: false, error: "Sin permiso." };
  await a.from("match_sugerencias").update({ estatus: "rechazado" }).eq("id", id);
  return { ok: true };
}
