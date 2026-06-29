"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";

// Notificaciones del usuario autenticado. La inserción la hace un trigger de BD
// (al registrarse una donación). Aquí solo se lee/marca, siempre acotado a sc.uid.

export async function listarNotificaciones(limite = 30) {
  const sc = await getScope();
  if (!sc.uid) return { rows: [], noLeidas: 0 };
  const a = createAdminClient();
  const [{ data }, { count }] = await Promise.all([
    a.from("notificaciones").select("*").eq("usuario_destino_id", sc.uid)
      .order("fecha_creacion", { ascending: false }).limit(limite),
    a.from("notificaciones").select("*", { count: "exact", head: true })
      .eq("usuario_destino_id", sc.uid).eq("leida", false),
  ]);
  return { rows: data ?? [], noLeidas: count ?? 0 };
}

export async function marcarLeida(id: string) {
  const sc = await getScope();
  if (!sc.uid) return { ok: false };
  const a = createAdminClient();
  await a.from("notificaciones").update({ leida: true }).eq("id", id).eq("usuario_destino_id", sc.uid);
  return { ok: true };
}

export async function marcarTodasLeidas() {
  const sc = await getScope();
  if (!sc.uid) return { ok: false };
  const a = createAdminClient();
  await a.from("notificaciones").update({ leida: true }).eq("usuario_destino_id", sc.uid).eq("leida", false);
  return { ok: true };
}

// Encola una notificación a los miembros de una institución (hospital/centro/refugio).
// Si la institución no tiene miembros, cae a TODOS los admins (nunca se pierde el aviso).
// Reutilizable por ofertas/donaciones/IA. Devuelve a cuántos usuarios se notificó.
export async function notificarInstitucion(hospitalId: string, mensaje: string): Promise<number> {
  if (!hospitalId || !mensaje?.trim()) return 0;
  const a = createAdminClient();
  const { data: miembros } = await a.from("membresias").select("user_id").eq("hospital_id", hospitalId);
  let destinos = (miembros ?? []).map((m: any) => m.user_id).filter(Boolean);
  if (!destinos.length) {
    const { data: admins } = await a.from("profiles").select("id").eq("rol", "admin");
    destinos = (admins ?? []).map((x: any) => x.id).filter(Boolean);
  }
  if (!destinos.length) return 0;
  const dedup = [...new Set<string>(destinos)];
  const { error } = await a.from("notificaciones").insert(dedup.map((id) => ({ usuario_destino_id: id, mensaje })));
  return error ? 0 : dedup.length;
}
