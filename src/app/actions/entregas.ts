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

// El portador marca la donación EN CAMINO hacia el centro (paso intermedio opcional).
export async function marcarEnTransito(codigo: string) {
  const a = createAdminClient();
  const { data: e } = await a.from("entregas").select("id, estado, entrega_user").eq("codigo", codigo).maybeSingle();
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (e.estado === "recibido") return { ok: false as const, error: "Ya fue recibida." };
  const { error } = await a.from("entregas").update({ estado: "en_transito" }).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
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

  const a = createAdminClient();
  const sc = await getScope();
  if (!sc.uid) return { ok: false as const, error: "Inicia sesión para confirmar la recepción." };

  const { data: e } = await a.from("entregas")
    .select("id, estado, hospital_id, insumo_id, cantidad, entrega_nombre, entrega_user, oferta_id").eq("codigo", codigo).maybeSingle();
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

  // Si hay necesidad ligada: registra la donación 'recibido' → recomputar_necesidad (trigger Agente 3).
  let donacion_id: string | null = null;
  if (e.insumo_id) {
    const { data: don } = await a.from("donaciones").insert({
      insumo_id: e.insumo_id, cantidad: cantidad ?? 1, estado: "recibido",
      donante_user: e.entrega_user ?? null, donante_nombre: e.entrega_nombre ?? null,
    }).select("id").single();
    donacion_id = don?.id ?? null;
  }

  const { data: ent, error } = await a.from("entregas").update({
    estado: "recibido", recibido_por_user: sc.uid, recibido_por_nombre: perfil?.nombre ?? null,
    recibido_at: new Date().toISOString(), foto_path, lugar, gps_lat: gpsLat, gps_lng: gpsLng, nota,
    cantidad, hospital_id: hospitalEfectivo, donacion_id,
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
  foto_url: string | null; nota: string | null;
  oferta: { descripcion: string; tipo: string; created_at: string; contacto_nombre: string | null } | null;
  hospital: { nombre: string | null; ubicacion: string | null } | null;
  refugio: { nombre: string | null; ubicacion: string | null; gps_lat: number | null; gps_lng: number | null } | null;
  insumo: { nombre: string | null; area: string | null } | null;
};

// Estado PÚBLICO de una donación por su código (link compartible). Sin datos sensibles del receptor.
export async function getDonacionPublica(codigo: string): Promise<EntregaPublica | null> {
  if (!codigo) return null;
  const { urlFoto } = await import("@/lib/media");
  const a = createAdminClient();
  const { data: e } = await a.from("entregas")
    .select(`codigo, estado, cantidad, area, recibido_at, recibido_por_nombre, lugar, foto_path, nota,
      ofertas:oferta_id(descripcion, tipo, created_at, contacto_nombre),
      hospital:hospital_id(nombre, ubicacion),
      refugio:refugio_id(nombre, ubicacion, gps_lat, gps_lng),
      insumos:insumo_id(nombre, area)`)
    .eq("codigo", codigo).maybeSingle();
  if (!e) return null;
  const r: any = e;
  return {
    codigo: r.codigo, estado: r.estado, cantidad: r.cantidad, area: r.area,
    recibido_at: r.recibido_at, recibido_por_nombre: r.recibido_por_nombre, lugar: r.lugar,
    foto_url: urlFoto(r.foto_path), nota: r.nota,
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
    .in("estado", ["pendiente", "en_transito"]).order("created_at", { ascending: false }).limit(100);
  if (!sc.admin) {
    if (!sc.hospitalIds.length) return [];
    // entregas a sus hospitales O libres (sin hospital aún).
    q = q.or(`hospital_id.in.(${sc.hospitalIds.join(",")}),hospital_id.is.null`);
  }
  const { data } = await q;
  return (data ?? []).map((r: any) => ({ ...r, foto_url: urlFoto(r.foto_path) }));
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
