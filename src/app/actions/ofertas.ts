"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { sugerirMatches } from "@/app/actions/match";
import { notificarInstitucion } from "@/app/actions/notificaciones";
import { crearEntregaParaOferta, codigoUnico } from "@/app/actions/entregas";
import { analizarDocumento, analizarTexto, transcribirAudio } from "@/lib/ai/vision";

const CAMPOS = ["tipo", "descripcion", "cantidad", "ubicacion_actual", "contacto_nombre", "contacto_telefono", "refugio_id",
  "presentacion", "unidad", "area", "vencimiento", "insumo_id"];

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

  limpio.codigo = await codigoUnico(a);
  const { data, error } = await a.from("ofertas").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await avisarCentro(centro, data); // notificación encolada al centro/refugio (best-effort)
  // Traza de entrega (trazabilidad): pendiente, ligada a la necesidad si se relacionó.
  const entrega = await crearEntregaParaOferta(data.id, { insumoId: limpio.insumo_id ?? null }).catch(() => null);

  // Match IA en background-best-effort: si falla, la oferta queda igual (se puede re-sugerir).
  const n = await sugerirMatches(data.id).catch(() => 0);
  const matches = await sugerenciasDeOfertas(a, [data.id]).catch(() => []);
  return { ok: true, oferta: data, codigo: data.codigo as string, entregaCodigo: entrega?.codigo ?? data.codigo, sugerencias: n, matches };
}

export type ItemDonacion = {
  nombre: string; cantidad: number | null;
  presentacion?: string | null; unidad?: string | null; area?: string | null;
  vencimiento?: string | null;   // ISO date (caducidad) — opcional
  insumo_id?: string | null;     // necesidad concreta a la que el donante relaciona el ítem (o null = libre)
};

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

  const filas = await Promise.all(limpios.map(async (i) => ({
    tipo: "insumo_fisico", descripcion: descItem(i),
    cantidad: i.cantidad != null && Number.isFinite(Number(i.cantidad)) ? Math.floor(Number(i.cantidad)) : null,
    presentacion: i.presentacion ?? null, unidad: i.unidad ?? null, area: i.area ?? null,
    vencimiento: i.vencimiento ?? null, insumo_id: i.insumo_id ?? null,
    ubicacion_actual: base.ubicacion_actual ?? null, refugio_id: base.refugio_id,
    usuario_oferente_id: ident.usuario_oferente_id, contacto_nombre: ident.contacto_nombre, contacto_telefono: ident.contacto_telefono,
    codigo: await codigoUnico(a),
  })));
  const { data, error } = await a.from("ofertas").insert(filas).select();
  if (error) return { ok: false as const, error: error.message };
  // Traza de entrega por cada oferta, ligada a la necesidad relacionada (si la hay).
  for (const of of data ?? []) await crearEntregaParaOferta(of.id, { insumoId: (of as any).insumo_id ?? null }).catch(() => null);

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
  return { ok: true as const, creadas: (data ?? []).length, sugerencias, matches, codigos: (data ?? []).map((o: any) => o.codigo as string) };
}

// Para el intake inteligente: dado el nombre de cada producto, sugiere las NECESIDADES
// activas (insumos solicitados) que mejor encajan, para que el donante las relacione.
// Lectura pública (las necesidades son públicas). Coincidencia por tokens del nombre.
export type NecesidadOpcion = { insumo_id: string; nombre: string; area: string | null; prioridad: string | null; cantidad: number | null; unidad: string | null; hospital: string | null; hospital_id: string };
export async function necesidadesParaItems(nombres: string[]): Promise<Record<number, NecesidadOpcion[]>> {
  const limpios = (nombres ?? []).map((n) => (n ?? "").trim());
  if (!limpios.some(Boolean)) return {};
  const a = createAdminClient();
  const { data } = await a.from("insumos")
    .select("id, nombre, area, prioridad, cantidad, unidad, hospital_id, hospitales(nombre)")
    .in("estado", ["solicitado", "en_transito"]).limit(800);
  const necesidades = (data ?? []) as any[];
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const PRIO: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  const out: Record<number, NecesidadOpcion[]> = {};
  limpios.forEach((nombre, idx) => {
    if (!nombre) { out[idx] = []; return; }
    const toks = norm(nombre).split(/\s+/).filter((t) => t.length > 2);
    const scored = necesidades
      .map((n) => {
        const hay = norm(n.nombre);
        const hits = toks.filter((t) => hay.includes(t)).length;
        return { n, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((p, q) => (q.hits - p.hits) || ((PRIO[p.n.prioridad] ?? 9) - (PRIO[q.n.prioridad] ?? 9)))
      .slice(0, 4)
      .map((x) => ({
        insumo_id: x.n.id, nombre: x.n.nombre, area: x.n.area ?? null, prioridad: x.n.prioridad ?? null,
        cantidad: x.n.cantidad ?? null, unidad: x.n.unidad ?? null,
        hospital: x.n.hospitales?.nombre ?? null, hospital_id: x.n.hospital_id,
      }));
    out[idx] = scored;
  });
  return out;
}

// "Mis donaciones": las ofertas que el usuario logueado ha registrado (con su centro de
// entrega y estatus). Solo suyas (acotado a sc.uid).
export async function misOfertas() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  const { data } = await a.from("ofertas")
    .select("id,codigo,tipo,descripcion,cantidad,estatus,created_at,refugio_id,hospitales:refugio_id(nombre,ubicacion),entregas(codigo,estado,recibido_at)")
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
