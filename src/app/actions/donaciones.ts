"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// Flujo FASE 3 — Donación responde a una Necesidad (insumo). El trigger de BD
// recalcula en_camino/recibida/estatus (el "match"); aquí solo validamos permisos.
const DENEGADO = { ok: false as const, error: "No autorizado para esta acción." };

// Responsable/Admin Institucional confirma una donación -> ítems pasan a "En Camino".
export async function crearDonacion(insumoId: string, cantidad: number, centroId?: string) {
  const sc = await getScope();
  const a = createAdminClient();
  // Donante = admin, rol ONG, o miembro de algún centro de acopio.
  let esOng = false;
  if (!sc.admin && sc.centroIds.length === 0 && sc.uid) {
    const { data: perfil } = await a.from("profiles").select("rol").eq("id", sc.uid).maybeSingle();
    esOng = perfil?.rol === "ong";
  }
  if (!sc.admin && sc.centroIds.length === 0 && !esOng) return DENEGADO;
  const cant = Math.floor(Number(cantidad));
  if (!Number.isFinite(cant) || cant <= 0) return { ok: false, error: "Cantidad inválida." };

  // Centro donante: el indicado (si es miembro) o, por defecto, su único centro.
  const centro = centroId && (sc.admin || sc.centroIds.includes(centroId)) ? centroId : (sc.centroIds[0] ?? null);
  let nombre: string | null = null;
  if (sc.uid) {
    const { data: perfil } = await a.from("profiles").select("nombre").eq("id", sc.uid).maybeSingle();
    nombre = perfil?.nombre ?? null;
  }
  const { error } = await a.from("donaciones").insert({
    insumo_id: insumoId, centro_id: centro, donante_user: sc.uid, donante_nombre: nombre,
    cantidad: cant, estado: "en_camino",
  });
  if (error) return { ok: false, error: error.message };
  await registrarLog("donar", "insumo", insumoId, { cantidad: cant });
  return { ok: true };
}

// Responsable de Centro de Salud confirma que recibió la donación.
export async function marcarRecibido(donacionId: string) {
  const a = createAdminClient();
  const { data: d } = await a.from("donaciones").select("insumo_id, insumos(hospital_id)").eq("id", donacionId).single();
  const hospitalId = (d as any)?.insumos?.hospital_id;
  const sc = await getScope();
  if (!sc.admin && !(hospitalId && sc.hospitalIds.includes(hospitalId))) return DENEGADO;
  const { error } = await a.from("donaciones").update({ estado: "recibido" }).eq("id", donacionId);
  if (error) return { ok: false, error: error.message };
  await registrarLog("recibir", "donacion", donacionId);
  return { ok: true };
}

// El donante (o admin) cancela una donación en camino -> el remanente vuelve a Pendiente.
export async function cancelarDonacion(donacionId: string) {
  const a = createAdminClient();
  const { data: d } = await a.from("donaciones").select("donante_user, centro_id").eq("id", donacionId).single();
  const sc = await getScope();
  const propio = (d as any)?.donante_user === sc.uid || (!!(d as any)?.centro_id && sc.centroIds.includes((d as any).centro_id));
  if (!sc.admin && !propio) return DENEGADO;
  const { error } = await a.from("donaciones").update({ estado: "cancelado" }).eq("id", donacionId);
  if (error) return { ok: false, error: error.message };
  await registrarLog("cancelar", "donacion", donacionId);
  return { ok: true };
}

// Intención de donar a un hospital (texto libre). NUNCA se bloquea: el aviso llega
// al/los responsable(s) del hospital y a los admin globales. Si no hay responsable,
// igual llega a admin. Pública: cualquiera (con o sin cuenta) puede donar.
export async function avisarDonacionHospital(hospitalId: string, texto: string) {
  const t = (texto ?? "").trim();
  if (!t) return { ok: false as const, error: "Escribe qué quieres donar." };
  const a = createAdminClient();
  const sc = await getScope();
  const { data: hosp } = await a.from("hospitales")
    .select("nombre, responsable_recepcion_nombre, responsable_recepcion_contacto").eq("id", hospitalId).maybeSingle();

  let quien = "Alguien";
  if (sc.uid) { const { data: p } = await a.from("profiles").select("nombre, email").eq("id", sc.uid).maybeSingle(); quien = p?.nombre || p?.email || "Un usuario"; }

  // Destinatarios: responsables (miembros del hospital) + admins globales. Dedup.
  const [{ data: miembros }, { data: admins }] = await Promise.all([
    a.from("membresias").select("user_id").eq("hospital_id", hospitalId),
    a.from("profiles").select("id").eq("rol", "admin"),
  ]);
  const ids = new Set<string>();
  (miembros ?? []).forEach((m: any) => m.user_id && ids.add(m.user_id));
  (admins ?? []).forEach((x: any) => x.id && ids.add(x.id));

  const tieneResp = !!(hosp?.responsable_recepcion_nombre || hosp?.responsable_recepcion_contacto);
  const msg = `💜 ${quien} quiere donar a ${hosp?.nombre ?? "el hospital"}: "${t}". ` +
    (tieneResp ? "Coordina la recepción con el donante." : "Sin responsable asignado — gestiona la recepción como admin.");
  if (ids.size) await a.from("notificaciones").insert([...ids].map((id) => ({ usuario_destino_id: id, mensaje: msg })));

  return {
    ok: true as const,
    notificados: ids.size,
    responsable: tieneResp ? { nombre: hosp!.responsable_recepcion_nombre, contacto: hosp!.responsable_recepcion_contacto } : null,
  };
}
