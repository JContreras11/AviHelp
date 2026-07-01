"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// PRE-LLENAR formularios de donación: datos de contacto del usuario logueado.
// Devuelve null si no hay sesión (así el flujo anónimo queda en blanco como hoy).
// Prefiere los campos del perfil (nombre/telefono/email). Server-side (respeta impersonación).
export async function perfilContacto(): Promise<{ nombre: string | null; telefono: string | null; email: string | null } | null> {
  const sc = await getScope();
  if (!sc.uid) return null;
  const a = createAdminClient();
  const { data: p } = await a.from("profiles").select("nombre, telefono, email").eq("id", sc.uid).maybeSingle();
  return { nombre: p?.nombre ?? null, telefono: p?.telefono ?? null, email: p?.email ?? null };
}

// Flujo FASE 3 — Donación responde a una Necesidad (insumo). El trigger de BD
// recalcula en_camino/recibida/estatus (el "match"); aquí solo validamos permisos.
const DENEGADO = { ok: false as const, error: "No autorizado para esta acción." };

// Responsable/Admin Institucional REGISTRA una donación. NACE 'registrada' (pendiente):
// NO cuenta como "en camino" hasta que alguien la mueva explícitamente (marcarDonacionEnCamino).
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
    cantidad: cant, estado: "registrada",
  });
  if (error) return { ok: false, error: error.message };
  await registrarLog("donar", "insumo", insumoId, { cantidad: cant });
  return { ok: true };
}

// Acción EXPLÍCITA: el donante/centro marca su donación EN CAMINO (ya salió hacia el destino).
// Solo aquí una donación pasa a contar como "en camino" en la conciliación de la Necesidad.
export async function marcarDonacionEnCamino(donacionId: string) {
  const a = createAdminClient();
  const sc = await getScope();
  const { data: d } = await a.from("donaciones").select("donante_user, centro_id, estado").eq("id", donacionId).single();
  if (!d) return { ok: false as const, error: "Donación no encontrada." };
  if ((d as any).estado === "recibido") return { ok: false as const, error: "Ya fue recibida." };
  const propio = (d as any).donante_user === sc.uid || (!!(d as any).centro_id && sc.centroIds.includes((d as any).centro_id));
  if (!sc.admin && !propio) return DENEGADO;
  const { error } = await a.from("donaciones").update({ estado: "en_camino" }).eq("id", donacionId);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "donacion", donacionId, { estado: "en_camino" });
  return { ok: true as const };
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
    insumo_id: insumoId, cantidad: cant, estado: "registrada",
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

// Centros/refugios CERCANOS a un hospital (dónde entregar la donación), por proximidad,
// SIN incluir el hospital mismo. Reutiliza lugaresEntrega (fuente única = hospitales).
// Se muestra en el modal rápido y en CentroModal (sección de donar).
export async function centrosDeHospital(hospitalId: string): Promise<LugarEntrega[]> {
  const lugares = await lugaresEntrega(hospitalId);
  return lugares.filter((l) => !l.esHospital);
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

// FIX NEVER-ORPHAN: registra una cuenta de DONANTE público (email + contraseña) para que
// su donación quede ligada a un usuario real, no huérfana. Crea el usuario confirmado
// (email_confirm) y rellena su perfil; el cliente luego hace signInWithPassword para
// abrir sesión y reenviar la donación ya autenticada. Si el correo ya existe, lo indica
// para que inicie sesión en su lugar.
export async function registrarDonante(datos: { email: string; password: string; nombre?: string; telefono?: string }) {
  const email = datos.email?.trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) return { ok: false as const, error: "Escribe un correo válido." };
  if (!datos.password || datos.password.length < 6) return { ok: false as const, error: "La contraseña debe tener al menos 6 caracteres." };
  const a = createAdminClient();
  const { data, error } = await a.auth.admin.createUser({ email, password: datos.password, email_confirm: true });
  if (error) {
    const ya = /already|registered|exist/i.test(error.message);
    return { ok: false as const, error: ya ? "Ese correo ya tiene cuenta. Inicia sesión con tu contraseña." : error.message, yaExiste: ya };
  }
  await a.from("profiles").update({
    nombre: datos.nombre?.trim() || null, telefono: datos.telefono?.trim() || null, rol: "publico", activo: true,
  }).eq("id", data.user.id);
  await registrarLog("crear", "usuario", data.user.id, { email, origen: "donante" });
  return { ok: true as const };
}

// Un lugar donde entregar (o presentarse, si es voluntariado) una donación.
export type LugarEntrega = {
  id: string; nombre: string; ubicacion: string | null;
  gps_lat: number | null; gps_lng: number | null;
  tipo: string;                 // 'hospital' | 'clinica' | 'refugio' | 'centro'
  contacto: string | null;
  distanciaKm: number | null;   // al hospital (heurística de proximidad, servidor)
  esHospital: boolean;          // true = el hospital mismo (entrega directa)
};

// Distancia Haversine en km (para ordenar puntos por cercanía).
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Lugares de ENTREGA de la donación para un hospital. NUNCA vacío (FIX 1):
//  1) refugios/centros mapeados por ciudad (tabla hospital_refugio) primero;
//  2) el RESTO de refugios/centros como respaldo, ordenados por cercanía (haversine);
//  3) SIEMPRE el hospital mismo como punto de entrega válido (entregar directo allí).
// Fuente única = hospitales (tipo refugio/centro son puntos de acopio). Para el modal de
// donación, CentroModal, la página de refugios y el chat de Avi (info pública).
export async function lugaresEntrega(hospitalId: string): Promise<LugarEntrega[]> {
  if (!hospitalId) return [];
  const a = createAdminClient();
  const [hospRes, hrRes, puntosRes] = await Promise.all([
    a.from("hospitales").select("id,nombre,ubicacion,gps_lat,gps_lng,tipo,contacto").eq("id", hospitalId).maybeSingle(),
    a.from("hospital_refugio").select("refugio_id").eq("hospital_id", hospitalId),
    a.from("hospitales").select("id,nombre,ubicacion,gps_lat,gps_lng,tipo,contacto").in("tipo", ["refugio", "centro"]),
  ]);
  const hosp: any = hospRes.data;
  const mapeados = new Set((hrRes.data ?? []).map((x: any) => x.refugio_id).filter(Boolean));
  const hLat = hosp?.gps_lat, hLng = hosp?.gps_lng;
  const dist = (p: any) =>
    hLat != null && hLng != null && p.gps_lat != null && p.gps_lng != null ? haversineKm(hLat, hLng, p.gps_lat, p.gps_lng) : null;

  type Cand = { p: any; mapeado: boolean; d: number | null };
  const candidatos = (puntosRes.data ?? [])
    .filter((p: any) => p.id !== hospitalId)
    .map((p: any): Cand => ({ p, mapeado: mapeados.has(p.id), d: dist(p) }))
    .sort((x: Cand, y: Cand) => {
      if (x.mapeado !== y.mapeado) return x.mapeado ? -1 : 1;   // los de su ciudad primero
      return (x.d ?? Infinity) - (y.d ?? Infinity);              // luego, por cercanía
    })
    .slice(0, 6)
    .map(({ p, d }: Cand): LugarEntrega => ({
      id: p.id, nombre: p.nombre, ubicacion: p.ubicacion, gps_lat: p.gps_lat, gps_lng: p.gps_lng,
      tipo: p.tipo, contacto: p.contacto ?? null, distanciaKm: d, esHospital: false,
    }));

  // SIEMPRE ≥1 lugar: el propio hospital es un punto de entrega válido.
  if (hosp) candidatos.push({
    id: hosp.id, nombre: hosp.nombre, ubicacion: hosp.ubicacion, gps_lat: hosp.gps_lat, gps_lng: hosp.gps_lng,
    tipo: hosp.tipo ?? "hospital", contacto: hosp.contacto ?? null, distanciaKm: 0, esHospital: true,
  });
  return candidatos;
}
