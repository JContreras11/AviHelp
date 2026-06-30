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
