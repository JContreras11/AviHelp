"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { sugerirAsignacion, type NecesidadCtx } from "@/lib/ai/match";
import { notificarInstitucion } from "@/app/actions/notificaciones";
import { analizarDocumento, analizarTexto, transcribirAudio } from "@/lib/ai/vision";

const CAMPOS = ["tipo", "descripcion", "cantidad", "ubicacion_actual", "contacto_nombre", "contacto_telefono", "refugio_id"];

// Centros de acopio / refugios donde se entrega la donación (instituciones tipo refugio).
// El form los lista y, con geolocalización, ordena por cercanía (gps_lat/gps_lng).
export async function listarCentrosEntrega() {
  const a = createAdminClient();
  const { data } = await a.from("hospitales")
    .select("id,nombre,ubicacion,gps_lat,gps_lng").eq("tipo", "refugio").order("nombre");
  return data ?? [];
}

// Resuelve identidad de contacto (perfil si hay sesión; teléfono obligatorio si anónimo).
// Muta `limpio` con usuario_oferente_id/contacto_*. Devuelve error si falta el teléfono anónimo.
async function resolverIdentidad(sc: Awaited<ReturnType<typeof getScope>>, a: any, limpio: Record<string, any>) {
  limpio.usuario_oferente_id = sc.uid ?? null;
  if (sc.uid) {
    const { data: perfil } = await a.from("profiles").select("nombre, telefono").eq("id", sc.uid).maybeSingle();
    limpio.contacto_nombre = perfil?.nombre ?? limpio.contacto_nombre ?? null;
    limpio.contacto_telefono = perfil?.telefono ?? limpio.contacto_telefono ?? null;
  } else if (!limpio.contacto_telefono?.trim()) {
    return "Deja un teléfono de contacto.";
  }
  return null;
}

// Valida que refugio_id sea un centro de acopio/refugio real. Devuelve el centro o un error.
async function resolverCentro(a: any, refugioId: any): Promise<{ centro?: { id: string; nombre: string }; error?: string }> {
  if (!refugioId) return { error: "Elige el centro de acopio o refugio donde entregarás." };
  const { data: centro } = await a.from("hospitales").select("id, nombre").eq("id", refugioId).eq("tipo", "refugio").maybeSingle();
  if (!centro) return { error: "El centro de entrega elegido no es válido." };
  return { centro };
}

export type MatchSugerido = { oferta_id: string; producto: string | null; hospital: string | null; area: string | null; cantidad: number | null; razon: string | null };

// Lee las sugerencias de match (ya insertadas por sugerirMatches) enriquecidas con el
// CENTRO/HOSPITAL que necesita el producto y el ÁREA (pediatría/trauma/…) de la solicitud.
// Para que Avi sugiera conversando "esto lo necesita el Hospital X — área Y".
async function sugerenciasDeOfertas(a: any, ofertaIds: string[]): Promise<MatchSugerido[]> {
  if (!ofertaIds.length) return [];
  const { data } = await a.from("match_sugerencias")
    .select("oferta_id, cantidad_sugerida, razon, hospitales(nombre), insumos(nombre, area)")
    .in("oferta_id", ofertaIds).eq("estatus", "sugerido");
  return (data ?? []).map((m: any) => ({
    oferta_id: m.oferta_id, producto: m.insumos?.nombre ?? null, hospital: m.hospitales?.nombre ?? null,
    area: m.insumos?.area ?? null, cantidad: m.cantidad_sugerida ?? null, razon: m.razon ?? null,
  }));
}

async function avisarCentro(centro: { id: string; nombre: string }, of: any) {
  await notificarInstitucion(
    centro.id,
    `💜 Nueva donación en camino a ${centro.nombre}: "${of.descripcion}"${of.cantidad ? ` (${of.cantidad} und.)` : ""}. ` +
    `Contacto: ${[of.contacto_nombre, of.contacto_telefono].filter(Boolean).join(" · ") || "ver oferta"}.`,
  ).catch(() => 0);
}

// Crea una oferta (PÚBLICA: ciudadano/empresa, con o sin sesión) y dispara el match IA.
export async function crearOferta(campos: Record<string, any>) {
  const sc = await getScope();
  const a = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS) if (k in campos) limpio[k] = campos[k];
  if (!["insumo_fisico", "personal_humano"].includes(limpio.tipo)) return { ok: false, error: "Tipo de oferta inválido." };
  if (!limpio.descripcion?.trim()) return { ok: false, error: "Describe qué ofreces." };
  const errId = await resolverIdentidad(sc, a, limpio);
  if (errId) return { ok: false, error: errId };
  const { centro, error: errC } = await resolverCentro(a, limpio.refugio_id);
  if (errC || !centro) { limpio.refugio_id = null; return { ok: false, error: errC }; }

  const { data, error } = await a.from("ofertas").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await avisarCentro(centro, data); // notificación encolada al centro/refugio (best-effort)

  // Match IA en background-best-effort: si falla, la oferta queda igual (se puede re-sugerir).
  const n = await sugerirMatches(data.id).catch(() => 0);
  const matches = await sugerenciasDeOfertas(a, [data.id]).catch(() => []);
  return { ok: true, oferta: data, sugerencias: n, matches };
}

export type ItemDonacion = { nombre: string; cantidad: number | null; presentacion?: string | null; unidad?: string | null; area?: string | null };

// IA: extrae productos + cantidades desde FOTO, AUDIO o TEXTO (reusa vision.ts).
// Soporta donación MIXTA: la lista puede traer varios productos de distinta índole.
export async function extraerDonacion(formData: FormData): Promise<{ ok: true; items: ItemDonacion[]; contexto: string | null } | { ok: false; error: string }> {
  const texto = (formData.get("texto") as string | null) ?? "";
  const imagen = formData.get("imagen");
  const audio = formData.get("audio");

  let res;
  if (imagen instanceof File && imagen.size) {
    const buf = Buffer.from(await imagen.arrayBuffer());
    res = await analizarDocumento(`data:${imagen.type || "image/jpeg"};base64,${buf.toString("base64")}`);
  } else if (audio instanceof File && audio.size) {
    const buf = Buffer.from(await audio.arrayBuffer());
    const fmt = (audio.type.split("/")[1] ?? "webm").split(";")[0].replace("x-", "").replace("mpeg", "mp3");
    const txt = (await transcribirAudio(buf.toString("base64"), fmt)).trim();
    if (!txt) return { ok: false, error: "No se entendió el audio. Intenta de nuevo." };
    res = await analizarTexto(txt);
  } else if (texto.trim()) {
    res = await analizarTexto(texto);
  } else {
    return { ok: false, error: "Envía una foto, un audio o describe lo que donas." };
  }
  if (!res.ok) return { ok: false, error: res.motivo };

  const items: ItemDonacion[] = (res.data.insumos ?? [])
    .filter((i) => i.nombre?.trim())
    .map((i) => ({ nombre: i.nombre.trim(), cantidad: i.cantidad, presentacion: i.presentacion, unidad: i.unidad, area: i.area }));
  if (!items.length) return { ok: false, error: "No detectamos productos. Describe lo que donas a mano." };
  return { ok: true, items, contexto: res.data.contexto ?? null };
}

const descItem = (i: ItemDonacion) => {
  const pres = i.presentacion && i.presentacion !== "otro" ? i.presentacion : i.unidad;
  return `${i.nombre}${pres ? ` (${pres})` : ""}`;
};

// Crea una oferta por CADA producto (donación mixta), todas al mismo centro de entrega.
// Una sola notificación-resumen al centro; match IA por cada oferta. Devuelve total de sugerencias.
export async function crearOfertasMixtas(items: ItemDonacion[], base: { refugio_id: string; ubicacion_actual?: string; contacto_nombre?: string; contacto_telefono?: string }) {
  const sc = await getScope();
  const a = createAdminClient();
  const limpios = (items ?? []).filter((i) => i?.nombre?.trim());
  if (!limpios.length) return { ok: false as const, error: "No hay productos que registrar." };

  const ident: Record<string, any> = { contacto_nombre: base.contacto_nombre, contacto_telefono: base.contacto_telefono };
  const errId = await resolverIdentidad(sc, a, ident);
  if (errId) return { ok: false as const, error: errId };
  const { centro, error: errC } = await resolverCentro(a, base.refugio_id);
  if (errC || !centro) return { ok: false as const, error: errC ?? "Centro inválido." };

  const filas = limpios.map((i) => ({
    tipo: "insumo_fisico", descripcion: descItem(i),
    cantidad: i.cantidad != null && Number.isFinite(Number(i.cantidad)) ? Math.floor(Number(i.cantidad)) : null,
    ubicacion_actual: base.ubicacion_actual ?? null, refugio_id: base.refugio_id,
    usuario_oferente_id: ident.usuario_oferente_id, contacto_nombre: ident.contacto_nombre, contacto_telefono: ident.contacto_telefono,
  }));
  const { data, error } = await a.from("ofertas").insert(filas).select();
  if (error) return { ok: false as const, error: error.message };

  // Una notificación-resumen (mixta) al centro/refugio.
  const resumen = limpios.map((i) => `${i.cantidad ?? "—"}× ${i.nombre}`).join(", ");
  await notificarInstitucion(
    centro.id,
    `💜 Donación (varios productos) en camino a ${centro.nombre}: ${resumen}. ` +
    `Contacto: ${[ident.contacto_nombre, ident.contacto_telefono].filter(Boolean).join(" · ") || "ver oferta"}.`,
  ).catch(() => 0);

  // Match IA por cada oferta creada.
  let sugerencias = 0;
  for (const of of data ?? []) sugerencias += await sugerirMatches(of.id).catch(() => 0);
  const matches = await sugerenciasDeOfertas(a, (data ?? []).map((o: any) => o.id)).catch(() => []);
  return { ok: true as const, creadas: (data ?? []).length, sugerencias, matches };
}

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

// "Mis donaciones": las ofertas que el usuario logueado ha registrado (con su centro de
// entrega y estatus). Solo suyas (acotado a sc.uid).
export async function misOfertas() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  const { data } = await a.from("ofertas")
    .select("id,tipo,descripcion,cantidad,estatus,created_at,refugio_id,hospitales:refugio_id(nombre,ubicacion)")
    .eq("usuario_oferente_id", sc.uid).order("created_at", { ascending: false });
  return data ?? [];
}

// El oferente cancela su propia oferta (o un admin). Devuelve el nuevo estatus.
export async function cancelarOferta(id: string) {
  const sc = await getScope();
  if (!sc.uid) return { ok: false as const, error: "Inicia sesión." };
  const a = createAdminClient();
  const { data: of } = await a.from("ofertas").select("usuario_oferente_id, estatus").eq("id", id).maybeSingle();
  if (!of) return { ok: false as const, error: "Oferta no encontrada." };
  if (!sc.admin && of.usuario_oferente_id !== sc.uid) return { ok: false as const, error: "No es tu oferta." };
  if (of.estatus === "entregado") return { ok: false as const, error: "Ya fue entregada, no se puede cancelar." };
  const { error } = await a.from("ofertas").update({ estatus: "cancelado" }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
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
