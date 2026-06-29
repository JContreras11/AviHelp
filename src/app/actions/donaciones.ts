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
