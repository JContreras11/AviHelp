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

// ── Donación PÚBLICA desde una necesidad (cualquiera, con datos de contacto) ──
// El donante "se registra" dejando nombre + teléfono/correo (sin cuenta). Abierto
// a futuro para OTP/WhatsApp. El trigger notifica al hospital y a sus centros de acopio.
export async function donarNecesidad(insumoId: string, datos: { cantidad: number; nombre: string; telefono?: string; email?: string }) {
  const cant = Math.floor(Number(datos.cantidad));
  if (!Number.isFinite(cant) || cant <= 0) return { ok: false as const, error: "Indica una cantidad válida." };
  if (!datos.nombre?.trim()) return { ok: false as const, error: "Escribe tu nombre." };
  if (!datos.telefono?.trim()) return { ok: false as const, error: "Deja un teléfono de contacto (para coordinar la entrega)." };

  const a = createAdminClient();
  const sc = await getScope();
  const { data: insumo } = await a.from("insumos").select("hospital_id, nombre, hospitales(nombre, ubicacion)").eq("id", insumoId).single();
  if (!insumo) return { ok: false as const, error: "La necesidad ya no existe." };

  const { error } = await a.from("donaciones").insert({
    insumo_id: insumoId, cantidad: cant, estado: "en_camino",
    donante_user: sc.uid ?? null,
    donante_nombre: datos.nombre.trim(),
    donante_telefono: datos.telefono?.trim() || null,
    donante_email: datos.email?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("donar", "insumo", insumoId, { cantidad: cant, donante: datos.nombre.trim() });

  // ¿A dónde llevarla? Refugios cercanos (por ciudad) + centros de acopio relacionados.
  const centros = await lugaresEntrega((insumo as any).hospital_id);
  return { ok: true as const, centros, hospital: (insumo as any).hospitales ?? null };
}

// Centros de acopio relacionados con un hospital (dónde entregar la donación).
export async function centrosDeHospital(hospitalId: string) {
  if (!hospitalId) return [];
  const a = createAdminClient();
  const { data } = await a.from("centro_hospital")
    .select("centros_acopio(id,nombre,zona,ubicacion,gps_lat,gps_lng,contacto_telefono,horario)")
    .eq("hospital_id", hospitalId);
  return (data ?? []).map((r: any) => r.centros_acopio).filter(Boolean);
}

// Admin: define qué hospitales atiende un centro de acopio (N:M).
export async function setCentroHospitales(centroId: string, hospitalIds: string[]) {
  if (!(await getScope()).admin) return DENEGADO;
  const a = createAdminClient();
  await a.from("centro_hospital").delete().eq("centro_id", centroId);
  if (hospitalIds.length) {
    const { error } = await a.from("centro_hospital").insert(hospitalIds.map((h) => ({ centro_id: centroId, hospital_id: h })));
    if (error) return { ok: false as const, error: error.message };
  }
  await registrarLog("editar", "centro", centroId, { hospitales: hospitalIds.length });
  return { ok: true as const };
}

// Hospitales que atiende un centro (para el editor de relación).
export async function hospitalesDeCentro(centroId: string) {
  const a = createAdminClient();
  const { data } = await a.from("centro_hospital").select("hospital_id").eq("centro_id", centroId);
  return (data ?? []).map((r: any) => r.hospital_id);
}

// Lugares de ENTREGA de la donación para un hospital: refugios cercanos (match por
// ciudad, tabla hospital_refugio) + centros de acopio relacionados. Para el modal de
// donación, la página de refugios y el chat de Avi (info pública).
export async function lugaresEntrega(hospitalId: string) {
  if (!hospitalId) return [];
  const a = createAdminClient();
  const { data: hr } = await a.from("hospital_refugio").select("refugio_id").eq("hospital_id", hospitalId);
  const ids = (hr ?? []).map((x: any) => x.refugio_id).filter(Boolean);
  let refs: any[] = [];
  if (ids.length) refs = (await a.from("hospitales").select("id,nombre,ubicacion,zona,gps_lat,gps_lng").in("id", ids)).data ?? [];
  const { data: ch } = await a.from("centro_hospital")
    .select("centros_acopio(id,nombre,zona,ubicacion,gps_lat,gps_lng,contacto_telefono,horario)").eq("hospital_id", hospitalId);
  const cens = (ch ?? []).map((r: any) => r.centros_acopio).filter(Boolean);
  return [
    ...cens.map((c: any) => ({ ...c, tipo: "Centro de acopio" })),
    ...refs.map((r: any) => ({ ...r, tipo: "Refugio" })),
  ];
}
