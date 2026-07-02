"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";
import { notificarInstitucion } from "@/app/actions/notificaciones";

// AGENTE 1 (Donaciones) — TRAZABILIDAD de la entrega.
// Cierra el ciclo donación↔solicitud→entrega→recepción confirmada por personal
// del hospital (con foto, hora, lugar, quién entrega/recibe). Ver migración
// 20260630120000_entregas_trazabilidad.sql.
//
// NO toca match.ts ni recomputar_necesidad: al confirmar una recepción ligada a una
// necesidad concreta, inserta un registro en `donaciones` (estado='recibido') y deja
// que el trigger existente del Agente 3 recalcule el estado de la necesidad.

const SIN_PERMISO = { ok: false as const, error: "No autorizado para confirmar esta entrega." };

// Código corto legible (sin caracteres ambiguos) para el link público de la donación.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCodigo(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

// Genera un código único para una oferta (reintenta ante colisión, muy improbable).
export async function codigoUnico(a: ReturnType<typeof createAdminClient>): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = genCodigo();
    const { data } = await a.from("ofertas").select("id").eq("codigo", c).maybeSingle();
    if (!data) return c;
  }
  return genCodigo() + String(Date.now() % 97); // fallback prácticamente único
}

// Crea el registro de ENTREGA (estado 'pendiente') para una oferta recién creada.
// Si la oferta se relacionó con una necesidad (insumo_id), se guarda hospital/área para el cierre.
export async function crearEntregaParaOferta(ofertaId: string, opts: { insumoId?: string | null } = {}) {
  const a = createAdminClient();
  const { data: of } = await a.from("ofertas")
    .select("id, codigo, cantidad, refugio_id, contacto_nombre, contacto_telefono, usuario_oferente_id").eq("id", ofertaId).maybeSingle();
  if (!of) return null;

  let hospital_id: string | null = null;
  let area: string | null = null;
  if (opts.insumoId) {
    const { data: ins } = await a.from("insumos").select("hospital_id, area").eq("id", opts.insumoId).maybeSingle();
    hospital_id = ins?.hospital_id ?? null;
    area = ins?.area ?? null;
  }

  // Un solo código compartible por donación: la entrega reusa el código de la oferta.
  const codigo = (of as any).codigo ?? await codigoUnico(a);
  const { data, error } = await a.from("entregas").insert({
    codigo, oferta_id: ofertaId, insumo_id: opts.insumoId ?? null,
    hospital_id, area, refugio_id: (of as any).refugio_id ?? null, cantidad: (of as any).cantidad ?? null,
    entrega_nombre: (of as any).contacto_nombre ?? null, entrega_telefono: (of as any).contacto_telefono ?? null,
    entrega_user: (of as any).usuario_oferente_id ?? null,
  }).select("id, codigo").single();
  if (error) return null;
  return data;
}

// El donante (o staff) relaciona una donación pendiente con una necesidad concreta,
// o la libera (insumoId=null) para que el equipo decida. Actualiza la traza de entrega.
export async function relacionarConNecesidad(entregaId: string, insumoId: string | null) {
  const a = createAdminClient();
  const sc = await getScope();
  const { data: e } = await a.from("entregas").select("id, entrega_user, estado").eq("id", entregaId).maybeSingle();
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (e.estado === "recibido") return { ok: false as const, error: "Ya fue recibida." };
  const propia = sc.admin || (!!sc.uid && (e as any).entrega_user === sc.uid);
  if (!propia && !sc.admin) return { ok: false as const, error: "No es tu donación." };

  let hospital_id: string | null = null, area: string | null = null;
  if (insumoId) {
    const { data: ins } = await a.from("insumos").select("hospital_id, area").eq("id", insumoId).maybeSingle();
    if (!ins) return { ok: false as const, error: "La necesidad ya no existe." };
    hospital_id = ins.hospital_id; area = ins.area ?? null;
  }
  const { error } = await a.from("entregas").update({ insumo_id: insumoId, hospital_id, area }).eq("id", entregaId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// Helper para el Agente 3 (match): tras aprobar un match oferta↔necesidad, liga la
// traza de entrega de esa oferta a la necesidad aprobada para que la recepción se enrute
// al hospital correcto. Idempotente; no toca match_sugerencias.
export async function relacionarEntregaDeOferta(ofertaId: string, insumoId: string) {
  const a = createAdminClient();
  const { data: e } = await a.from("entregas").select("id, estado").eq("oferta_id", ofertaId).maybeSingle();
  if (!e || e.estado === "recibido") return { ok: false as const };
  const { data: ins } = await a.from("insumos").select("hospital_id, area").eq("id", insumoId).maybeSingle();
  if (!ins) return { ok: false as const };
  await a.from("entregas").update({ insumo_id: insumoId, hospital_id: ins.hospital_id, area: ins.area ?? null }).eq("id", e.id);
  return { ok: true as const };
}

// ── CICLO DE ENTREGA (2 piernas: donante → centro de acopio → hospital) ──
// registrada → en_camino_acopio → en_acopio → en_camino_hospital → recibido
// La conciliación de la necesidad se maneja por `donaciones` (trigger recomputar_necesidad):
// aquí sincronizamos donaciones.estado con la pierna de la entrega.
const TERMINALES = ["recibido", "rechazado", "cancelado"];

async function sincronizarDonacion(
  a: ReturnType<typeof createAdminClient>,
  donacionId: string | null | undefined,
  estadoDon: "registrada" | "en_camino" | "recibido" | "cancelado",
) {
  if (donacionId) await a.from("donaciones").update({ estado: estadoDon }).eq("id", donacionId);
}

// ¿El usuario gestiona el CENTRO DE ACOPIO (refugio_id) de esta entrega? (miembro del centro o admin)
async function esMiembroAcopio(refugioId: string | null): Promise<boolean> {
  const sc = await getScope();
  if (sc.admin) return true;
  if (!refugioId || !sc.uid) return false;
  return sc.centroIds.includes(refugioId) || sc.hospitalIds.includes(refugioId);
}

type EntregaCiclo = { id: string; estado: string; entrega_user: string | null; refugio_id: string | null; hospital_id: string | null; donacion_id: string | null };
async function cargarEntrega(a: ReturnType<typeof createAdminClient>, codigo: string): Promise<EntregaCiclo | null> {
  const { data } = await a.from("entregas").select("id, estado, entrega_user, refugio_id, hospital_id, donacion_id").eq("codigo", codigo).maybeSingle();
  return (data as EntregaCiclo | null) ?? null;
}

// 1) El DONANTE/portador marca que su donación va EN CAMINO al centro de acopio.
export async function marcarEnCaminoAcopio(codigo: string) {
  const a = createAdminClient();
  const sc = await getScope();
  const e = await cargarEntrega(a, codigo);
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (TERMINALES.includes(e.estado)) return { ok: false as const, error: "Esta entrega ya está cerrada." };
  const propia = sc.admin || (!!sc.uid && e.entrega_user === sc.uid);
  if (!propia) return SIN_PERMISO;
  const { error } = await a.from("entregas").update({ estado: "en_camino_acopio" }).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
  await sincronizarDonacion(a, e.donacion_id, "en_camino");
  await registrarLog("editar", "entrega", e.id, { estado: "en_camino_acopio" });
  return { ok: true as const };
}

// Centros de acopio que gestiona el usuario (para elegir "en cuál llegó"). Admin ve todos.
export async function misCentros(): Promise<{ id: string; nombre: string }[]> {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  let q = a.from("hospitales").select("id, nombre").eq("tipo", "centro").order("nombre");
  if (!sc.admin) {
    if (!sc.centroIds.length) return [];
    q = q.in("id", sc.centroIds);
  }
  const { data } = await q;
  return (data ?? []) as { id: string; nombre: string }[];
}

// 2) El CENTRO DE ACOPIO confirma que la donación LLEGÓ al acopio.
// `centroId` opcional: registra EN CUÁL de los centros que gestiona el usuario llegó
// (útil cuando administra varios acopios ligados al mismo hospital).
export async function marcarEnAcopio(codigo: string, centroId?: string | null) {
  const a = createAdminClient();
  const e = await cargarEntrega(a, codigo);
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (TERMINALES.includes(e.estado)) return { ok: false as const, error: "Esta entrega ya está cerrada." };
  const destino = centroId || e.refugio_id;
  if (!(await esMiembroAcopio(destino))) return { ok: false as const, error: "Solo el centro de acopio destino puede marcar la llegada." };
  const upd: Record<string, unknown> = { estado: "en_acopio" };
  if (centroId && centroId !== e.refugio_id) upd.refugio_id = centroId; // deja constancia de en cuál acopio llegó
  const { error } = await a.from("entregas").update(upd).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
  await sincronizarDonacion(a, e.donacion_id, "en_camino"); // sigue en camino hacia el hospital
  // Avisa al donante que su donación llegó al acopio.
  if (e.entrega_user) await a.from("notificaciones").insert({ usuario_destino_id: e.entrega_user, mensaje: `📦 Tu donación llegó al centro de acopio. Mira el estado: /donaciones/${codigo}` }).catch(() => 0);
  // Avisa a la institución (hospital) que su donación ya está en un acopio.
  if (e.hospital_id) await notificarInstitucion(e.hospital_id, `📦 Una donación para tu hospital llegó a un centro de acopio (${codigo}); pronto sale hacia ustedes.`).catch(() => 0);
  await registrarLog("editar", "entrega", e.id, { estado: "en_acopio" });
  return { ok: true as const };
}

// 3) El CENTRO DE ACOPIO DESPACHA la donación hacia el hospital.
export async function despacharAHospital(codigo: string) {
  const a = createAdminClient();
  const e = await cargarEntrega(a, codigo);
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (TERMINALES.includes(e.estado)) return { ok: false as const, error: "Esta entrega ya está cerrada." };
  if (!(await esMiembroAcopio(e.refugio_id))) return { ok: false as const, error: "Solo el centro de acopio puede despachar la donación." };
  const { error } = await a.from("entregas").update({ estado: "en_camino_hospital" }).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
  await sincronizarDonacion(a, e.donacion_id, "en_camino");
  // Avisa a la institución (hospital) que la donación va EN CAMINO hacia ellos.
  if (e.hospital_id) await notificarInstitucion(e.hospital_id, `🚚 Una donación va EN CAMINO a tu hospital (${codigo}). Prepárense para recibirla y confirmarla.`).catch(() => 0);
  await registrarLog("editar", "entrega", e.id, { estado: "en_camino_hospital" });
  return { ok: true as const };
}

// (Compat / donación directa sin acopio) marca EN CAMINO al hospital.
export async function marcarEnTransito(codigo: string) {
  const a = createAdminClient();
  const sc = await getScope();
  const e = await cargarEntrega(a, codigo);
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (TERMINALES.includes(e.estado)) return { ok: false as const, error: "Esta entrega ya está cerrada." };
  const propia = sc.admin || (!!sc.uid && e.entrega_user === sc.uid) || (await esMiembroAcopio(e.refugio_id));
  if (!propia) return SIN_PERMISO;
  const { error } = await a.from("entregas").update({ estado: "en_camino_hospital" }).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
  await sincronizarDonacion(a, e.donacion_id, "en_camino");
  return { ok: true as const };
}

// ¿El usuario actual puede CONFIRMAR la recepción de esta entrega?
// Admin global, o miembro del hospital destino. Si la entrega aún no tiene hospital
// (donación libre), cualquier miembro de hospital puede recibirla en su centro.
async function puedeRecibir(hospitalId: string | null): Promise<boolean> {
  const sc = await getScope();
  if (sc.admin) return true;
  if (!sc.uid || !sc.hospitalIds.length) return false;
  if (!hospitalId) return true; // donación libre: la recibe el centro del que confirma
  return sc.hospitalIds.includes(hospitalId);
}

// CONFIRMACIÓN de recepción por personal del hospital habilitado. Sube la foto de
// evidencia, registra hora/lugar/quién recibe y, si hay necesidad ligada, crea un
// registro en `donaciones` (estado='recibido') → el trigger del Agente 3 recalcula
// el estado de la necesidad. Devuelve la entrega confirmada.
export async function confirmarRecepcion(formData: FormData) {
  const codigo = String(formData.get("codigo") ?? "");
  const nota = (formData.get("nota") as string | null)?.trim() || null;
  const lugar = (formData.get("lugar") as string | null)?.trim() || null;
  const cantStr = formData.get("cantidad") as string | null;
  const gpsLat = formData.get("gps_lat") ? Number(formData.get("gps_lat")) : null;
  const gpsLng = formData.get("gps_lng") ? Number(formData.get("gps_lng")) : null;
  const foto = formData.get("foto");
  const lote = (formData.get("lote") as string | null)?.trim() || null;
  const seriales = (formData.get("seriales") as string | null)?.trim() || null;
  // Evidencia opcional anti-robo (lote/seriales); jsonb null si no se aportó nada.
  const evidencia = (lote || seriales) ? { lote, seriales } : null;

  const a = createAdminClient();
  const sc = await getScope();
  if (!sc.uid) return { ok: false as const, error: "Inicia sesión para confirmar la recepción." };

  const { data: e } = await a.from("entregas")
    .select("id, estado, hospital_id, insumo_id, cantidad, entrega_nombre, entrega_user, oferta_id, donacion_id").eq("codigo", codigo).maybeSingle();
  if (!e) return { ok: false as const, error: "No encontramos esa entrega." };
  if (e.estado === "recibido") return { ok: false as const, error: "Esta entrega ya fue confirmada." };

  // El hospital efectivo: el de la necesidad ligada o, si es libre, el del receptor.
  const hospitalEfectivo = e.hospital_id ?? (sc.admin ? null : sc.hospitalIds[0] ?? null);
  if (!(await puedeRecibir(e.hospital_id))) return SIN_PERMISO;

  // Sube la foto de evidencia (obligatoria para la trazabilidad).
  let foto_path: string | null = null;
  if (foto instanceof File && foto.size) {
    const buf = Buffer.from(await foto.arrayBuffer());
    const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    const path = `entregas/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await a.storage.from("fotos").upload(path, buf, { contentType: foto.type || "image/jpeg", upsert: false });
    if (!upErr) foto_path = path;
  }
  if (!foto_path) return { ok: false as const, error: "Adjunta una foto de la recepción (requisito de trazabilidad)." };

  const { data: perfil } = await a.from("profiles").select("nombre").eq("id", sc.uid).maybeSingle();
  const cantidad = cantStr && Number.isFinite(Number(cantStr)) ? Math.max(1, Math.floor(Number(cantStr))) : (e.cantidad ?? null);

  // Cierra la conciliación: si la entrega ya está ligada a una donación (caso normal),
  // la marca 'recibido' — SIN duplicar. Solo si no hubiera fila donaciones, la crea.
  // El trigger recomputar_necesidad recalcula cantidad_recibida/estado de la necesidad.
  let donacion_id: string | null = (e as any).donacion_id ?? null;
  if (e.insumo_id) {
    if (donacion_id) {
      await a.from("donaciones").update({ estado: "recibido", cantidad: cantidad ?? 1 }).eq("id", donacion_id);
    } else {
      const { data: don } = await a.from("donaciones").insert({
        insumo_id: e.insumo_id, cantidad: cantidad ?? 1, estado: "recibido",
        donante_user: e.entrega_user ?? null, donante_nombre: e.entrega_nombre ?? null,
      }).select("id").single();
      donacion_id = don?.id ?? null;
    }
  }

  // SEGURIDAD/CONFIANZA: si se confirma lejos del hospital destino, se deja constancia en la nota
  // (posible discrepancia de ubicación → análisis anti-fraude). No bloquea; solo etiqueta.
  let notaFinal = nota;
  if (gpsLat != null && gpsLng != null && hospitalEfectivo) {
    const { data: h } = await a.from("hospitales").select("gps_lat, gps_lng").eq("id", hospitalEfectivo).maybeSingle();
    if (h?.gps_lat != null && h?.gps_lng != null) {
      const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
      const dLat = rad(h.gps_lat - gpsLat), dLng = rad(h.gps_lng - gpsLng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(gpsLat)) * Math.cos(rad(h.gps_lat)) * Math.sin(dLng / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
      if (km > 5) notaFinal = `⚠️ Confirmado a ~${Math.round(km)} km del hospital (revisar ubicación). ${nota ?? ""}`.trim();
    }
  }

  const { data: ent, error } = await a.from("entregas").update({
    estado: "recibido", recibido_por_user: sc.uid, recibido_por_nombre: perfil?.nombre ?? null,
    recibido_at: new Date().toISOString(), foto_path, lugar, gps_lat: gpsLat, gps_lng: gpsLng, nota: notaFinal,
    cantidad, hospital_id: hospitalEfectivo, donacion_id, evidencia,
  }).eq("id", e.id).select().single();
  if (error) return { ok: false as const, error: error.message };

  // Marca la oferta como entregada (cierre del ciclo del lado donación).
  if (e.oferta_id) await a.from("ofertas").update({ estatus: "entregado" }).eq("id", e.oferta_id);

  // Avisa al oferente (si tiene cuenta) que su donación fue recibida.
  if (e.entrega_user) {
    await a.from("notificaciones").insert({
      usuario_destino_id: e.entrega_user,
      mensaje: `✅ Tu donación fue recibida y confirmada${perfil?.nombre ? ` por ${perfil.nombre}` : ""}. ¡Gracias! Mira el detalle: /donaciones/${codigo}`,
    }).catch(() => 0);
  }
  await registrarLog("recibir", "entrega", e.id, { codigo, donacion_id });
  return { ok: true as const, entrega: ent };
}

// El receptor RECHAZA la entrega (no llegó / no corresponde). Cierra la traza sin cubrir necesidad.
export async function rechazarEntrega(codigo: string, motivo?: string) {
  const a = createAdminClient();
  const { data: e } = await a.from("entregas").select("id, estado, hospital_id").eq("codigo", codigo).maybeSingle();
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (e.estado === "recibido") return { ok: false as const, error: "Ya fue recibida." };
  if (!(await puedeRecibir(e.hospital_id))) return SIN_PERMISO;
  const { error } = await a.from("entregas").update({ estado: "rechazado", nota: motivo?.trim() || null }).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export type EntregaPublica = {
  codigo: string; estado: string; cantidad: number | null; area: string | null;
  recibido_at: string | null; recibido_por_nombre: string | null; lugar: string | null;
  foto_url: string | null; nota: string | null; evidencia: { lote?: string | null; seriales?: string | null } | null;
  oferta: { descripcion: string; tipo: string; created_at: string; contacto_nombre: string | null } | null;
  hospital: { nombre: string | null; ubicacion: string | null; gps_lat: number | null; gps_lng: number | null } | null;
  refugio: { nombre: string | null; ubicacion: string | null; gps_lat: number | null; gps_lng: number | null } | null;
  insumo: { nombre: string | null; area: string | null } | null;
};

// Estado PÚBLICO de una donación por su código (link compartible). Sin datos sensibles del receptor.
export async function getDonacionPublica(codigo: string): Promise<EntregaPublica | null> {
  if (!codigo) return null;
  const { urlFoto } = await import("@/lib/media");
  const a = createAdminClient();
  const { data: e } = await a.from("entregas")
    .select(`codigo, estado, cantidad, area, recibido_at, recibido_por_nombre, lugar, foto_path, nota, evidencia,
      ofertas:oferta_id(descripcion, tipo, created_at, contacto_nombre),
      hospital:hospital_id(nombre, ubicacion, gps_lat, gps_lng),
      refugio:refugio_id(nombre, ubicacion, gps_lat, gps_lng),
      insumos:insumo_id(nombre, area)`)
    .eq("codigo", codigo).maybeSingle();
  if (!e) return null;
  const r: any = e;
  return {
    codigo: r.codigo, estado: r.estado, cantidad: r.cantidad, area: r.area,
    recibido_at: r.recibido_at, recibido_por_nombre: r.recibido_por_nombre, lugar: r.lugar,
    foto_url: urlFoto(r.foto_path), nota: r.nota, evidencia: r.evidencia ?? null,
    oferta: r.ofertas ?? null, hospital: r.hospital ?? null, refugio: r.refugio ?? null, insumo: r.insumos ?? null,
  };
}

// Bandeja de RECEPCIÓN del personal: entregas dirigidas a sus hospitales (o libres) por confirmar.
export async function listarEntregasPorRecibir() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const { urlFoto } = await import("@/lib/media");
  const a = createAdminClient();
  let q = a.from("entregas")
    .select(`id, codigo, estado, cantidad, area, created_at, entrega_nombre, entrega_telefono, foto_path,
      ofertas:oferta_id(descripcion, tipo), hospital:hospital_id(nombre), insumos:insumo_id(nombre, area), refugio:refugio_id(nombre)`)
    .in("estado", ["registrada", "en_camino_acopio", "en_acopio", "en_camino_hospital"]).order("created_at", { ascending: false }).limit(100);
  if (!sc.admin) {
    if (!sc.hospitalIds.length) return [];
    // entregas a sus hospitales O libres (sin hospital aún).
    q = q.or(`hospital_id.in.(${sc.hospitalIds.join(",")}),hospital_id.is.null`);
  }
  const { data } = await q;
  return (data ?? []).map((r: any) => ({ ...r, foto_url: urlFoto(r.foto_path) }));
}

// Bandeja del CENTRO DE ACOPIO: donaciones dirigidas a los centros del usuario, para marcar
// la llegada al acopio y despacharlas al hospital. `siguiente` indica la acción disponible.
export async function listarEntregasAcopio() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  let q = a.from("entregas")
    .select(`id, codigo, estado, cantidad, area, created_at, entrega_nombre, entrega_telefono,
      hospital:hospital_id(nombre), refugio:refugio_id(nombre), insumos:insumo_id(nombre, area), ofertas:oferta_id(descripcion, tipo)`)
    .in("estado", ["registrada", "en_camino_acopio", "en_acopio"]).order("created_at", { ascending: false }).limit(100);
  if (!sc.admin) {
    if (!sc.centroIds.length) return [];
    q = q.in("refugio_id", sc.centroIds);
  }
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    ...r,
    // acción disponible según el estado actual de la pierna de acopio.
    siguiente: r.estado === "en_acopio" ? "despachar" : "recibir_en_acopio",
  }));
}

// Historial de entregas CONFIRMADAS de los hospitales del usuario (auditoría/trazabilidad).
export async function listarEntregasConfirmadas() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const { urlFoto } = await import("@/lib/media");
  const a = createAdminClient();
  let q = a.from("entregas")
    .select(`id, codigo, estado, cantidad, area, recibido_at, recibido_por_nombre, lugar, foto_path,
      ofertas:oferta_id(descripcion), hospital:hospital_id(nombre), insumos:insumo_id(nombre)`)
    .eq("estado", "recibido").order("recibido_at", { ascending: false }).limit(100);
  if (!sc.admin) {
    if (!sc.hospitalIds.length) return [];
    q = q.in("hospital_id", sc.hospitalIds);
  }
  const { data } = await q;
  return (data ?? []).map((r: any) => ({ ...r, foto_url: urlFoto(r.foto_path) }));
}
