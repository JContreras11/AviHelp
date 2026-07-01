"use server";

import { createAdminClient, getScope, getSesion } from "@/lib/supabase/server";
import { extraerNecesidades, descargarTextoPagina, type ItemNecesidad } from "@/lib/ai/scrape";
import { registrarLog } from "@/app/actions/audit";
import { revalidatePath } from "next/cache";

// ════════════════════════════════════════════════════════════════════════
// SOLICITUDES: paquete compartible de necesidades (insumos). Crea desde texto,
// documento, URL (scraping) o agrupando necesidades existentes ("en cambote").
// "Necesidad" = insumos. Una solicitud agrupa varias y se difunde por /solicitud/[slug].
// ════════════════════════════════════════════════════════════════════════

const ESTADOS = ["abierta", "en_progreso", "cubierta", "cerrada"] as const;
type EstadoSolicitud = (typeof ESTADOS)[number];

// ── helpers de scope ──
// Para CREAR una solicitud vale cualquier membresía (incl. pendiente): un usuario recién
// registrado puede pedir para su propio centro aunque un admin aún no lo apruebe. Las
// lecturas y el cambio de estado siguen exigiendo membresía aprobada (usan sc.hospitalIds).
async function gestionaHospital(hospitalId: string | null | undefined): Promise<boolean> {
  if (!hospitalId) return false;
  const sc = await getScope();
  return sc.admin || sc.hospitalIdsTodos.includes(hospitalId);
}

// Hospital efectivo para crear: el dado (si lo gestiona) o, si el usuario tiene UNO solo, ese.
async function resolverHospital(hospitalId?: string | null): Promise<{ id: string } | { error: string }> {
  const sc = await getScope();
  if (!sc.uid) return { error: "Inicia sesión para crear una solicitud." };
  if (hospitalId) return (await gestionaHospital(hospitalId)) ? { id: hospitalId } : { error: "No gestionas ese centro." };
  if (!sc.admin && sc.hospitalIdsTodos.length === 1) return { id: sc.hospitalIdsTodos[0] };
  return { error: "Elige el centro de salud para la solicitud." };
}

// ── slug ──
function slugify(s: string): string {
  return (s || "solicitud")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "solicitud";
}
async function slugUnico(a: any, base: string): Promise<string> {
  const raiz = slugify(base);
  for (let intento = 0; intento < 6; intento++) {
    const sufijo = Math.random().toString(36).slice(2, intento === 0 ? 6 : 9);
    const cand = `${raiz}-${sufijo}`;
    const { data } = await a.from("solicitudes").select("id").eq("slug", cand).maybeSingle();
    if (!data) return cand;
  }
  return `${raiz}-${Date.now().toString(36)}`;
}

// Normaliza nombres para deduplicar necesidades dentro de una solicitud.
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Inserta/actualiza las necesidades extraídas dentro de una solicitud (dedupe por nombre).
async function sincronizarItems(
  a: any, solicitudId: string, hospitalId: string, items: ItemNecesidad[], fuente: "manual" | "scraper",
): Promise<{ creadas: number; actualizadas: number }> {
  if (!items.length) return { creadas: 0, actualizadas: 0 };
  const { data: existentes } = await a.from("insumos").select("id, nombre, cantidad").eq("solicitud_id", solicitudId);
  const porNombre = new Map<string, any>();
  for (const e of existentes ?? []) porNombre.set(norm(e.nombre), e);

  let creadas = 0, actualizadas = 0;
  const nuevas: any[] = [];
  for (const it of items) {
    const ya = porNombre.get(norm(it.nombre));
    if (ya) {
      // Match: actualiza cantidad si cambió (caso scraping recurrente).
      if (it.cantidad != null && Number(ya.cantidad) !== Number(it.cantidad)) {
        await a.from("insumos").update({ cantidad: it.cantidad }).eq("id", ya.id);
        actualizadas++;
      }
    } else {
      nuevas.push({
        hospital_id: hospitalId, solicitud_id: solicitudId, nombre: it.nombre,
        cantidad: it.cantidad, unidad: it.unidad, presentacion: it.presentacion,
        area: it.area, prioridad: it.prioridad ?? "media", fuente,
      });
      porNombre.set(norm(it.nombre), { id: "pendiente" }); // evita duplicar dentro del mismo lote
    }
  }
  if (nuevas.length) {
    const { error } = await a.from("insumos").insert(nuevas);
    if (!error) creadas = nuevas.length;
  }
  return { creadas, actualizadas };
}

type Resultado = { ok: true; slug: string; id: string; creadas: number; actualizadas: number } | { ok: false; error: string };

// ── 1) Crear desde TEXTO (pegar lista / dictado) ──
export async function crearSolicitudDesdeTexto(input: { texto: string; hospitalId?: string; titulo?: string }): Promise<Resultado> {
  const h = await resolverHospital(input.hospitalId);
  if ("error" in h) return { ok: false, error: h.error };
  if (!input.texto?.trim()) return { ok: false, error: "Pega el texto con las necesidades." };

  const ext = await extraerNecesidades(input.texto);
  if (!ext.items.length) return { ok: false, error: "No detecté necesidades en ese texto. Revisa que liste insumos." };
  return crearConItems({ hospitalId: h.id, titulo: input.titulo || ext.titulo, descripcion: ext.descripcion, fuente: "texto", items: ext.items });
}

// ── 1b) GATHER conversacional (chat de Avi): parsear items SIN exigir centro ──
// Avi acumula los insumos en el diálogo y luego resuelve el centro; por eso separamos
// "extraer" de "crear". No exige sesión ni centro: solo intenta detectar necesidades.
export async function prepararSolicitudDesdeTexto(
  texto: string,
): Promise<{ ok: true; items: ItemNecesidad[]; titulo: string | null; descripcion: string | null } | { ok: false; error: string }> {
  if (!texto?.trim()) return { ok: false, error: "Dime qué insumos necesitas (ej. 50 férulas, 20 cajas de guantes)." };
  const ext = await extraerNecesidades(texto);
  if (!ext.items.length) return { ok: false, error: "No detecté insumos ahí." };
  return { ok: true, items: ext.items, titulo: ext.titulo, descripcion: ext.descripcion };
}

// Crea con items YA extraídos y un centro YA resuelto (el chat lo llama tras el gather).
// Sigue respetando el scope: resolverHospital exige que el usuario gestione ese centro.
export async function crearSolicitudConItems(
  input: { hospitalId: string; items: ItemNecesidad[]; titulo?: string | null; descripcion?: string | null },
): Promise<Resultado> {
  const h = await resolverHospital(input.hospitalId);
  if ("error" in h) return { ok: false, error: h.error };
  if (!input.items?.length) return { ok: false, error: "No hay insumos para la solicitud." };
  return crearConItems({ hospitalId: h.id, titulo: input.titulo ?? null, descripcion: input.descripcion ?? null, fuente: "texto", items: input.items });
}

import OpenAI from "openai";

export async function resolverHospitalConLLM(
  query: string,
  opciones: { id: string; nombre: string }[]
): Promise<{ id: string; nombre: string } | null> {
  if (!query?.trim() || !opciones.length) return null;

  // 1) Hardcoded dictionary check first (super fast, no LLM cost)
  const normQuery = norm(query);
  const ALIASES: Record<string, string> = {
    "huc": "hospital universitario de caracas",
    "h.u.c.": "hospital universitario de caracas",
    "el llanito": "hospital dr. domingo luciani",
    "llanito": "hospital dr. domingo luciani",
    "perez carreno": "hospital miguel perez carreno",
    "perez carreño": "hospital miguel perez carreno",
    "perezcarreño": "hospital miguel perez carreno",
    "perezcarreno": "hospital miguel perez carreno",
    "miguel perez carreno": "hospital miguel perez carreno",
    "miguel perez carreño": "hospital miguel perez carreno",
    "magallanes": "hospital dr. jose gregorio hernandez",
    "magallanes de catia": "hospital dr. jose gregorio hernandez",
    "magallanes de carla": "hospital dr. jose gregorio hernandez",
    "jose gregorio hernandez": "hospital dr. jose gregorio hernandez",
    "vargas": "hospital jose maria vargas de caracas",
    "jm de los rios": "hospital de ninos dr. j.m. de los rios",
    "j.m. de los rios": "hospital de ninos dr. j.m. de los rios",
    "jm de los ríos": "hospital de ninos dr. j.m. de los rios",
    "j.m. de los ríos": "hospital de ninos dr. j.m. de los rios",
    "razetti": "hospital dr. luis razetti",
    "luis razetti": "hospital dr. luis razetti",
  };

  const aliasTarget = ALIASES[normQuery];
  if (aliasTarget) {
    const found = opciones.find(o => {
      const n = norm(o.nombre);
      return n.includes(aliasTarget) || aliasTarget.includes(n);
    });
    if (found) return found;
  }

  // 2) Exact or direct substring match
  const matchDirecto = opciones.find(o => {
    const n = norm(o.nombre);
    return n === normQuery || n.includes(normQuery) || normQuery.includes(n);
  });
  if (matchDirecto) return matchDirecto;

  // 3) LLM-based matching (interprets modismos, acronyms, typos, context)
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
  });
  const MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash-lite";

  try {
    const listText = opciones.map((o, idx) => `${idx}: ${o.nombre}`).join("\n");
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Analiza el texto de búsqueda y la lista de hospitales/centros de Venezuela. " +
            "Identifica si el texto de búsqueda se refiere a uno de los centros de la lista (considerando acrónimos como HUC, modismos, nombres populares como 'El Llanito', o errores tipográficos). " +
            "Responde SOLO JSON en este formato: {\"matched_index\": number | null}. " +
            "Si no estás seguro de que corresponda a ninguno de la lista, matched_index debe ser null."
        },
        {
          role: "user",
          content: `Texto de búsqueda: "${query}"\n\nLista de centros:\n${listText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const resObj = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    const matchedIdx = resObj.matched_index;
    if (typeof matchedIdx === "number" && matchedIdx >= 0 && matchedIdx < opciones.length) {
      return opciones[matchedIdx];
    }
  } catch (err) {
    console.error("Error in resolverHospitalConLLM:", err);
  }

  return null;
}

// Resuelve el CENTRO gestionable por nombre (fuzzy) para el gather del chat. Devuelve:
// - { match } si hay una coincidencia clara,
// - { opciones } (los centros que gestiona) para que el chat le pregunte cuál.
export async function resolverHospitalGestionable(
  nombre?: string | null,
): Promise<{ match: { id: string; nombre: string } } | { opciones: { id: string; nombre: string }[] }> {
  const gest = await hospitalesGestionables();
  const opciones = gest.map((g) => ({ id: g.id, nombre: g.nombre }));
  const q = norm(nombre ?? "");
  if (q && opciones.length) {
    const resolved = await resolverHospitalConLLM(nombre ?? "", opciones);
    if (resolved) return { match: resolved };

    const toks = q.split(" ").filter((t) => t.length > 2);
    const scored = opciones
      .map((o) => {
        const h = norm(o.nombre);
        let score = 0;
        if (h === q) score = 100;
        else if (h.includes(q) || q.includes(h)) score = 60;
        else score = toks.filter((t) => h.includes(t)).length;
        return { o, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) return { match: scored[0].o };
    if (scored.length > 1) return { opciones: scored.map((s) => s.o) };
  }
  return { opciones };
}

// ── 2) Crear desde URL (SCRAPING) — find-or-create + actualiza cantidades ──
export async function crearSolicitudDesdeURL(input: { url: string; hospitalId?: string }): Promise<Resultado> {
  const h = await resolverHospital(input.hospitalId);
  if ("error" in h) return { ok: false, error: h.error };

  const pagina = await descargarTextoPagina(input.url);
  if (!pagina.ok) return { ok: false, error: pagina.error || "No se pudo leer la página." };

  const ext = await extraerNecesidades(pagina.texto);
  if (!ext.items.length) return { ok: false, error: "Leí la página pero no encontré necesidades de insumos." };

  const a = createAdminClient();
  const sc = await getScope();
  const hash = hashTexto(pagina.texto);
  const urlNorm = input.url.trim();

  // Dedupe por URL de origen: si ya existe, reusar y actualizar.
  const { data: existente } = await a.from("solicitudes").select("id, slug, hospital_id, origen_hash").eq("origen_url", urlNorm).maybeSingle();
  if (existente) {
    if (!(await gestionaHospital(existente.hospital_id))) return { ok: false, error: "Esa página ya tiene una solicitud de otro centro." };
    const r = await sincronizarItems(a, existente.id, existente.hospital_id, ext.items, "scraper");
    if (hash !== existente.origen_hash) await a.from("solicitudes").update({ origen_hash: hash }).eq("id", existente.id);
    await registrarLog("scraping", "solicitud", existente.id, { url: urlNorm, ...r });
    revalidatePath(`/solicitud/${existente.slug}`); revalidatePath("/solicitudes");
    return { ok: true, slug: existente.slug, id: existente.id, ...r };
  }

  const slug = await slugUnico(a, ext.titulo || "necesidades");
  const { data: sol, error } = await a.from("solicitudes").insert({
    slug, titulo: ext.titulo || "Necesidades (importadas de una página)", descripcion: ext.descripcion,
    hospital_id: h.id, fuente: "url", origen_url: urlNorm, origen_hash: hash, created_by: sc.uid,
  }).select("id, slug").single();
  if (error || !sol) return { ok: false, error: error?.message || "No se pudo crear la solicitud." };

  const r = await sincronizarItems(a, sol.id, h.id, ext.items, "scraper");
  await registrarLog("scraping", "solicitud", sol.id, { url: urlNorm, nueva: true, ...r });
  revalidatePath("/solicitudes");
  return { ok: true, slug: sol.slug, id: sol.id, ...r };
}

// ── 3) Crear agrupando NECESIDADES EXISTENTES ("en cambote") ──
export async function crearSolicitudDesdeInsumos(input: { insumoIds: string[]; titulo?: string; descripcion?: string }): Promise<Resultado> {
  const sc = await getScope();
  if (!sc.uid) return { ok: false, error: "Inicia sesión." };
  const ids = (input.insumoIds ?? []).filter(Boolean);
  if (!ids.length) return { ok: false, error: "Selecciona al menos una necesidad." };

  const a = createAdminClient();
  const { data: insumos } = await a.from("insumos").select("id, hospital_id").in("id", ids);
  const permitidos = (insumos ?? []).filter((i: any) => sc.admin || sc.hospitalIds.includes(i.hospital_id));
  if (!permitidos.length) return { ok: false, error: "No gestionas esas necesidades." };
  const hospitalId = permitidos[0].hospital_id as string;

  const slug = await slugUnico(a, input.titulo || "necesidades");
  const { data: sol, error } = await a.from("solicitudes").insert({
    slug, titulo: input.titulo || "Solicitud de insumos", descripcion: input.descripcion,
    hospital_id: hospitalId, fuente: "existentes", created_by: sc.uid,
  }).select("id, slug").single();
  if (error || !sol) return { ok: false, error: error?.message || "No se pudo crear." };

  const { error: e2 } = await a.from("insumos").update({ solicitud_id: sol.id }).in("id", permitidos.map((i: any) => i.id));
  if (e2) return { ok: false, error: e2.message };
  await registrarLog("crear", "solicitud", sol.id, { fuente: "existentes", n: permitidos.length });
  revalidatePath("/solicitudes"); revalidatePath(`/solicitud/${sol.slug}`);
  return { ok: true, slug: sol.slug, id: sol.id, creadas: permitidos.length, actualizadas: 0 };
}

// ── 4) Crear desde una CARGA (documento subido) — agrupa sus insumos extraídos ──
export async function crearSolicitudDesdeCarga(cargaId: string, titulo?: string): Promise<Resultado> {
  const a = createAdminClient();
  const { data: insumos } = await a.from("insumos").select("id").eq("carga_id", cargaId).is("solicitud_id", null);
  const ids = (insumos ?? []).map((i: any) => i.id);
  if (!ids.length) return { ok: false, error: "Ese documento no tiene necesidades para compartir todavía." };
  const r = await crearSolicitudDesdeInsumos({ insumoIds: ids, titulo: titulo || "Insumos del documento" });
  if (r.ok) await a.from("solicitudes").update({ fuente: "documento", carga_id: cargaId }).eq("id", r.id);
  return r;
}

// Núcleo compartido: crea solicitud + sus necesidades desde items extraídos.
async function crearConItems(input: { hospitalId: string; titulo: string | null; descripcion: string | null; fuente: "texto" | "manual"; items: ItemNecesidad[] }): Promise<Resultado> {
  const a = createAdminClient();
  const sc = await getScope();
  const slug = await slugUnico(a, input.titulo || "necesidades");
  const { data: sol, error } = await a.from("solicitudes").insert({
    slug, titulo: input.titulo || "Necesidades", descripcion: input.descripcion,
    hospital_id: input.hospitalId, fuente: input.fuente, created_by: sc.uid,
  }).select("id, slug").single();
  if (error || !sol) return { ok: false, error: error?.message || "No se pudo crear la solicitud." };
  const r = await sincronizarItems(a, sol.id, input.hospitalId, input.items, "manual");
  await registrarLog("crear", "solicitud", sol.id, { fuente: input.fuente, ...r });
  revalidatePath("/solicitudes"); revalidatePath(`/solicitud/${sol.slug}`);
  return { ok: true, slug: sol.slug, id: sol.id, ...r };
}

// ── Lectura PÚBLICA (por slug) para /solicitud/[slug] ──
export async function obtenerSolicitudPublica(slug: string) {
  const a = createAdminClient();
  const { data: sol } = await a.from("solicitudes")
    .select("id, slug, titulo, descripcion, estado, fuente, origen_url, hospital_id, created_at, updated_at, hospitales(nombre, ubicacion)")
    .eq("slug", slug).maybeSingle();
  if (!sol) return null;
  const { data: insumos } = await a.from("insumos")
    .select("id, nombre, cantidad, unidad, presentacion, area, prioridad, estado, cantidad_en_camino, cantidad_recibida, hospital_id, hospitales(nombre)")
    .eq("solicitud_id", sol.id).order("prioridad", { ascending: true }).order("created_at", { ascending: true });
  const puedeGestionar = await gestionaHospital(sol.hospital_id);
  return { ...sol, insumos: insumos ?? [], puedeGestionar };
}

// ── Estado / actualización (solo quien gestiona el centro) ──
export async function actualizarEstadoSolicitud(id: string, estado: EstadoSolicitud): Promise<{ ok: boolean; error?: string }> {
  if (!ESTADOS.includes(estado)) return { ok: false, error: "Estado inválido." };
  const a = createAdminClient();
  const { data: sol } = await a.from("solicitudes").select("hospital_id, slug").eq("id", id).maybeSingle();
  if (!sol) return { ok: false, error: "No encontrada." };
  if (!(await gestionaHospital(sol.hospital_id))) return { ok: false, error: "Sin permiso sobre esta solicitud." };
  const { error } = await a.from("solicitudes").update({ estado }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "solicitud", id, { estado });
  revalidatePath(`/solicitud/${sol.slug}`); revalidatePath("/solicitudes");
  return { ok: true };
}

// ── Mis solicitudes (panel /solicitudes), con conteos de necesidades por estado ──
export async function listarMisSolicitudes() {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  let q = a.from("solicitudes").select("id, slug, titulo, estado, fuente, hospital_id, created_at, hospitales(nombre)").order("created_at", { ascending: false }).limit(200);
  if (!sc.admin) {
    if (!sc.hospitalIds.length) q = q.eq("created_by", sc.uid);
    else q = q.or(`hospital_id.in.(${sc.hospitalIds.join(",")}),created_by.eq.${sc.uid}`);
  }
  const { data: sols } = await q;
  if (!sols?.length) return [];
  const ids = sols.map((s: any) => s.id);
  const { data: insumos } = await a.from("insumos").select("solicitud_id, estado").in("solicitud_id", ids);
  const conteo = new Map<string, { total: number; cubiertas: number }>();
  for (const i of insumos ?? []) {
    const c = conteo.get(i.solicitud_id) ?? { total: 0, cubiertas: 0 };
    c.total++; if (i.estado === "cubierto" || i.estado === "entregado") c.cubiertas++;
    conteo.set(i.solicitud_id, c);
  }
  return sols.map((s: any) => ({ ...s, ...(conteo.get(s.id) ?? { total: 0, cubiertas: 0 }) }));
}

// ── Para el CHAT: estado de solicitudes con LINK DIRECTO, scope por rol ──
// admin/medico → todas; staff → las de sus centros o que crearon; público → activas públicas.
export async function estadoSolicitudesParaChat(): Promise<{ rol: string; rows: { slug: string; titulo: string; estado: string; hospital: string | null; url: string; total: number; cubiertas: number }[] }> {
  const sesion = await getSesion();
  const rol = sesion?.rol ?? "publico";
  const a = createAdminClient();
  let q = a.from("solicitudes").select("id, slug, titulo, estado, hospital_id, hospitales(nombre)").order("created_at", { ascending: false }).limit(40);

  if (rol !== "admin" && rol !== "medico") {
    const sc = await getScope();
    // staff con membresías: las de sus centros o que creó; sin membresía: las que creó; público: solo activas.
    if (!sc.uid) q = q.in("estado", ["abierta", "en_progreso"]);
    else if (sc.hospitalIds.length) q = q.or(`hospital_id.in.(${sc.hospitalIds.join(",")}),created_by.eq.${sc.uid}`);
    else q = q.eq("created_by", sc.uid);
  }
  const { data: sols } = await q;
  if (!sols?.length) return { rol, rows: [] };
  const ids = sols.map((s: any) => s.id);
  const { data: insumos } = await a.from("insumos").select("solicitud_id, estado").in("solicitud_id", ids);
  const conteo = new Map<string, { total: number; cubiertas: number }>();
  for (const i of insumos ?? []) {
    const c = conteo.get(i.solicitud_id) ?? { total: 0, cubiertas: 0 };
    c.total++; if (i.estado === "cubierto" || i.estado === "entregado") c.cubiertas++;
    conteo.set(i.solicitud_id, c);
  }
  const rows = sols.map((s: any) => ({
    slug: s.slug, titulo: s.titulo, estado: s.estado, hospital: s.hospitales?.nombre ?? null,
    url: `/solicitud/${s.slug}`, ...(conteo.get(s.id) ?? { total: 0, cubiertas: 0 }),
  }));
  return { rol, rows };
}

// Hospitales que el usuario puede gestionar (para el selector al crear).
export async function hospitalesGestionables(): Promise<{ id: string; nombre: string; tipo: string }[]> {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  let q = a.from("hospitales").select("id, nombre, tipo").order("nombre");
  if (!sc.admin) {
    // Para CREAR: incluye el centro registrado aunque esté pendiente de aprobación.
    if (!sc.hospitalIdsTodos.length) return [];
    q = q.in("id", sc.hospitalIdsTodos);
  }
  const { data } = await q;
  return (data ?? []) as { id: string; nombre: string; tipo: string }[];
}

// Necesidades del scope del usuario SIN solicitud aún (para agrupar "en cambote").
export async function necesidadesAgrupables(): Promise<{ id: string; nombre: string; cantidad: number | null; estado: string; hospital_id: string; hospital: string | null }[]> {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  let q = a.from("insumos").select("id, nombre, cantidad, estado, hospital_id, hospitales(nombre)").is("solicitud_id", null).neq("estado", "cancelado").order("created_at", { ascending: false }).limit(300);
  if (!sc.admin) {
    if (!sc.hospitalIds.length) return [];
    q = q.in("hospital_id", sc.hospitalIds);
  }
  const { data } = await q;
  return (data ?? []).map((i: any) => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, estado: i.estado, hospital_id: i.hospital_id, hospital: i.hospitales?.nombre ?? null }));
}

// Documentos (cargas) del usuario con necesidades aún SIN solicitud → compartibles.
export async function cargasCompartibles(): Promise<{ id: string; resumen: string | null; tipo: string | null; created_at: string; n: number }[]> {
  const sc = await getScope();
  if (!sc.uid) return [];
  const a = createAdminClient();
  // Insumos sueltos (sin solicitud) ligados a una carga, dentro del scope.
  let qi = a.from("insumos").select("carga_id, hospital_id").is("solicitud_id", null).not("carga_id", "is", null);
  if (!sc.admin) { if (!sc.hospitalIds.length) return []; qi = qi.in("hospital_id", sc.hospitalIds); }
  const { data: ins } = await qi.limit(2000);
  const conteo = new Map<string, number>();
  for (const i of ins ?? []) conteo.set(i.carga_id, (conteo.get(i.carga_id) ?? 0) + 1);
  const ids = [...conteo.keys()];
  if (!ids.length) return [];
  const { data: cargas } = await a.from("cargas").select("id, resumen, tipo, created_at").in("id", ids).order("created_at", { ascending: false }).limit(50);
  return (cargas ?? []).map((c: any) => ({ id: c.id, resumen: c.resumen, tipo: c.tipo, created_at: c.created_at, n: conteo.get(c.id) ?? 0 }));
}

// Hash estable y barato para detectar si la página scrapeada cambió.
function hashTexto(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(16);
}
