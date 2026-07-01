"use server";

import OpenAI from "openai";
import { createAdminClient, getSesion } from "@/lib/supabase/server";
import { transcribirAudio } from "@/lib/ai/vision";
import { buscarExterno } from "@/app/actions/externos";
import { consultarEntidad } from "@/app/actions/consultas";
import {
  estadoSolicitudesParaChat,
  prepararSolicitudDesdeTexto,
  crearSolicitudConItems,
  resolverHospitalGestionable,
} from "@/app/actions/solicitudes";
import { lugaresEntrega } from "@/app/actions/donaciones";
import { crearOfertasMixtas, listarCentrosEntrega } from "@/app/actions/ofertas";
import type { ItemNecesidad } from "@/lib/ai/scrape";

// Transcribe audio del micrófono a texto (para hablarle al chat).
export async function transcribirVoz(formData: FormData): Promise<string> {
  const file = formData.get("audio");
  if (!(file instanceof File) || file.size === 0) return "";
  const buf = Buffer.from(await file.arrayBuffer());
  const fmt = (file.type.split("/")[1] ?? "webm").split(";")[0].replace("x-", "").replace("mpeg", "mp3");
  try { return (await transcribirAudio(buf.toString("base64"), fmt)).trim(); } catch { return ""; }
}

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
});
const MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash-lite";

// Guía de la plataforma: Avi la usa para explicar CÓMO usar AviHelp y guiar con enlaces internos.
const GUIA = `GUÍA DE AVIHELP (úsala para explicar cómo usar la plataforma; los enlaces que empiezan con "/" son páginas internas: escríbelos tal cual para que el usuario haga clic e ir ahí):
- Qué es: plataforma gratuita que conecta a la gente en la emergencia: buscar personas, ver necesidades de hospitales y refugios, y donar.
- DONAR / OFRECER AYUDA: cualquiera, con o sin cuenta, entra a /ofrecer y registra insumos físicos (ej. 50 férulas) o se ofrece como personal de salud. La IA sugiere a qué hospital enviarlo y un coordinador lo confirma.
- DONAR A UNA NECESIDAD PUNTUAL (ONG/centro con cuenta): en Inicio, pestaña "Insumos", abre el insumo y usa "Donar (en camino)"; indica la cantidad y se concilia con lo pendiente.
- VER NECESIDADES: en Inicio, pestaña "Insumos" están los insumos que piden los hospitales. Cada hospital tiene una página para difundir con QR en /compartir/hospital/ID.
- CREAR / COMPARTIR UNA SOLICITUD (personal de salud con cuenta): en /solicitudes puedes armar un paquete de necesidades (cargando un documento, pegando texto, pegando un enlace/URL, o reuniendo necesidades existentes). Te da un enlace público /solicitud/ID para difundir en redes y chats de ONG, donde cualquiera dona directo. El estado de cada solicitud vive en su propia página.
- BUSCAR PERSONA: pregúntame el nombre o la cédula; también /desaparecidos lista a los reportados como desaparecidos.
- REFUGIOS: puedes preguntarme por refugios (incl. "refugios cercanos a tal hospital") y te los LISTO aquí con su enlace para llegar; la página completa con mapa es /refugios. PANEL de situación: /dashboard.
- PERSONAL DE CENTRO DE SALUD: abre un insumo y actualiza su estatus (Pendiente → En tránsito → Recibido).
- COORDINADOR / personal que gestiona donaciones: la bandeja de emparejamientos sugeridos por IA está en /admin/triage; ahí aprueba o rechaza.
Cuando expliques cómo hacer algo, da pasos cortos e incluye el enlace interno (ej. /ofrecer).`;

export type RespuestaChat = {
  respuesta: string; fuentes: any[]; externos?: any[];
  enlaces?: { titulo: string; url: string }[]; insumos?: any[];
  resultados?: ResultadoChat[]; pendiente?: PendienteChat | null;
};

// Chatbot RAG sobre datos estructurados: parsea -> consulta Postgres -> redacta.
// `ctx` = estado de una creación en curso (gather multi-turno) que el cliente reenvía.
export async function preguntar(pregunta: string, ctx?: PendienteChat | null): Promise<RespuestaChat> {
  if (!pregunta?.trim()) return { respuesta: "Hazme una pregunta.", fuentes: [] };

  // Contexto del usuario para que Avi hable mejor y tenga claros sus permisos.
  const sesion = await getSesion();

  // 0) CREACIÓN EN CURSO (gather multi-turno): si venimos de una pregunta pendiente
  //    (faltaba el centro, los insumos o el lugar de entrega), interpretamos este
  //    mensaje como la respuesta y seguimos el hilo — nunca reiniciamos ni damos un
  //    "no pude". El usuario puede cancelar en cualquier momento.
  if (ctx && (ctx.flow === "solicitud" || ctx.flow === "donacion")) {
    if (esCancelacion(pregunta)) return { respuesta: "Listo, lo dejamos así. ¿En qué más te ayudo? 💜", fuentes: [], pendiente: null };
    return ctx.flow === "solicitud" ? gatherSolicitud(pregunta, ctx, !!sesion) : gatherDonacion(pregunta, ctx);
  }
  const ROL_DESC: Record<string, string> = {
    admin: "Administrador (ve y gestiona todo)",
    medico: "Médico — admin real (ve todo, incl. responsables y contactos)",
    voluntario: "Voluntario (ve el estado de solicitudes y lo de SUS instituciones; no datos sensibles de otros)",
    ong: "ONG / donante (ve necesidades y puede donar)",
    publico: "Público sin cuenta (solo info pública: necesidades, ubicaciones, desaparecidos)",
  };
  const rolUser = sesion?.rol ?? "publico";
  const ctxUsuario = sesion
    ? `Usuario actual: ${sesion.nombre ? `"${sesion.nombre}"` : "(sin nombre)"}, rol ${rolUser} — ${ROL_DESC[rolUser] ?? rolUser}. Salúdalo por su nombre si lo tiene y adapta lo que reveles a su rol.`
    : `Usuario actual: visitante SIN cuenta (rol público). Solo info pública; si necesita más, invítalo a iniciar sesión.`;

  // 1) Extraer filtros de búsqueda de la pregunta.
  const f = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Clasifica la pregunta del usuario en una emergencia humanitaria. Responde SOLO JSON: " +
          '{"tipo":"datos|ayuda","entidad":"hospital|refugio|insumo|centro|persona|solicitud|donacion|null","accion":"crear_solicitud|crear_donacion|null","nombre":string|null,"ubicacion":string|null,"hospital":string|null,"estado":"vivo|herido|desaparecido|fallecido"|null}. ' +
          '"datos" = pide información concreta (refugios cercanos, quién es el responsable, dónde queda, qué insumos faltan, buscar a una persona, el estado de las solicitudes o de sus donaciones). ' +
          'entidad="solicitud" cuando pregunte por el ESTADO de sus solicitudes/pedidos/paquetes de necesidades o cómo van (ej. "¿cuál es el estado de mis solicitudes?", "¿cómo van mis pedidos?"). ' +
          'entidad="donacion" cuando pregunte por el ESTADO de SUS donaciones/ofrecimientos/lo que donó o envió (ej. "¿cómo va mi donación?", "estado de mis donaciones", "¿llegó lo que mandé?"). ' +
          'accion="crear_solicitud" cuando el usuario QUIERE crear/registrar/armar/publicar una solicitud o pedido de insumos para SU centro, o dice que NECESITA/le FALTA algo en su hospital (ej. "crea una solicitud con 50 férulas para el hospital X", "necesito guantes en mi hospital", "quiero registrar una solicitud"). NO hace falta que liste insumos: si faltan, se los pediremos después. ' +
          'accion="crear_donacion" cuando el usuario QUIERE DONAR/ENTREGAR/ofrecer insumos que ÉL tiene (ej. "tengo 30 cajas de guantes para donar", "quiero donar férulas", "quiero entregar insumos en el parque del este"). NO hace falta que liste todo: si falta, se lo pediremos. ' +
          'Distingue por intención: NECESITAR algo para su centro = crear_solicitud; TENER/DAR algo = crear_donacion. Si solo pregunta CÓMO se hace (sin querer hacerlo ahora), accion=null y tipo="ayuda". ' +
          '"ayuda" = cómo USAR la plataforma (cómo donar, cómo reportar). ' +
          "entidad: hospital (centro de salud/clínica: responsable/ubicación), refugio (refugios/albergues y refugios CERCANOS a un hospital), insumo (qué falta), centro (centro de acopio), persona (buscar a alguien), donacion (estado de lo que el usuario donó). " +
          'nombre = nombre del refugio/centro/persona. hospital = nombre del hospital/clínica mencionado (p. ej. "refugios cerca del hospital Razetti" -> entidad="refugio", hospital="Razetti").',
      },
      { role: "user", content: pregunta },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  let filtros: any = {};
  try { filtros = JSON.parse(f.choices[0]?.message?.content ?? "{}"); } catch {}

  // 1.5) ACCIÓN REAL: CREAR conversando. Avi guía el gather (pide lo que falte) y termina
  //      la creación — NUNCA da un "no pude" sin salida. Respeta el scope (resolverHospital
  //      exige que el usuario gestione el centro de la solicitud; la donación es abierta).
  if (filtros.accion === "crear_solicitud") {
    if (!sesion) {
      return { respuesta: "Para registrar una solicitud de tu centro necesito que inicies sesión como su personal. Si ya tienes cuenta, entra en /login y vuelve a pedírmelo. ¿O prefieres DONAR insumos? Eso lo puedes hacer sin cuenta.", fuentes: [] };
    }
    const estado: PendienteChat = { flow: "solicitud", items: [], titulo: null, descripcion: null, hospitalId: null, hospitalNombre: null, refugioId: null, refugioNombre: null, refugio: null, falta: null, centroHint: filtros.hospital ?? null };
    return gatherSolicitud(pregunta, estado, true);
  }
  if (filtros.accion === "crear_donacion") {
    const estado: PendienteChat = { flow: "donacion", items: [], titulo: null, descripcion: null, hospitalId: null, hospitalNombre: null, refugioId: null, refugioNombre: null, refugio: null, falta: null, centroHint: filtros.nombre ?? filtros.hospital ?? null };
    return gatherDonacion(pregunta, estado);
  }

  // Red de seguridad: si el clasificador no lo marcó pero el texto pide el estado de SUS
  // donaciones, forzamos la consulta de donaciones (con scope por rol).
  if (sesion && (!filtros.entidad || filtros.entidad === "null") && /\b(mis donaciones|mi donaci|estado de (mi|mis) don|lo que (don[eé]|mand[eé]|envi[eé]))/i.test(pregunta)) {
    filtros.tipo = "datos"; filtros.entidad = "donacion";
  }

  // 2) Consultar la base CON SCOPE POR ROL (tool de consulta de entidad).
  //    consultarEntidad decide qué campos puede ver el usuario según su rol.
  const supabase = createAdminClient();
  let datos: any = null;
  let externo: { resultados: any[]; enlaces: { titulo: string; url: string }[] } = { resultados: [], enlaces: [] };
  if (filtros.tipo === "datos" && filtros.entidad && filtros.entidad !== "null") {
    datos = await consultarEntidad(filtros.entidad, { nombre: filtros.nombre, ubicacion: filtros.ubicacion, estado: filtros.estado, hospital: filtros.hospital });
    // Persona sin resultado local -> fuentes externas en vivo + enlaces clicables.
    if (filtros.entidad === "persona" && (datos?.rows?.length ?? 0) === 0) {
      externo = await buscarExterno(filtros.nombre || pregunta);
    }
  }

  // 2c) SOLICITUDES: estado en vivo + LINK DIRECTO a cada página de estado, scope por rol.
  //     Se activa por el clasificador o por palabras clave ("solicitud/pedido/cómo van").
  let solicitudes: { slug: string; titulo: string; estado: string; hospital: string | null; url: string; total: number; cubiertas: number }[] = [];
  const preguntaSolicitudes = filtros.entidad === "solicitud" || /\bsolicitud|solicitudes|mis pedidos|c[oó]mo van/i.test(pregunta);
  if (preguntaSolicitudes) {
    try { solicitudes = (await estadoSolicitudesParaChat()).rows; } catch {}
  }

  // 2b) Búsqueda de texto completo (contexto extra de lo ya ingresado).
  let docs: any[] = [];
  try {
    const { data } = await supabase.rpc("buscar_documentos", { q: pregunta, match_count: 10 });
    docs = data ?? [];
  } catch {}

  // 3) Redactar respuesta con el contexto recuperado.
  const r = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Eres Avi, la asistente de AviHelp en una emergencia humanitaria. Cálida pero concisa. Responde en español. " +
          ctxUsuario + " " +
          "REGLA CLAVE: responde SIEMPRE con la información que te doy aquí. NUNCA digas que vayan a otra página, pestaña o sección para verla — si tengo los datos, dáselos directo en el chat. " +
          "(A) CÓMO USAR la plataforma (cómo donar/ofrecer/reportar) → guía con la GUÍA: pasos cortos + enlace interno (ej. /ofrecer) tal cual para clic. " +
          "(B) DATOS (qué falta, quién es responsable, dónde queda, buscar persona) → usa SOLO los datos provistos; da nombres, estado, ubicación, teléfono cuando existan; NO inventes. " +
          "RESPETA EL ROL: si un dato trae 'acceso: RESTRINGIDO' o una 'nota' de restricción, NO reveles ese dato; en su lugar da lo que SÍ se puede ver (p. ej. la ubicación) y, si el usuario es público/anónimo, sugiérele iniciar sesión si es personal autorizado. " +
          "Si buscas una persona y no hay datos locales pero sí externos, preséntalos indicando la fuente e invita a confirmar; escribe los 'Enlaces' como URLs completas al final. " +
          "REFUGIOS/CENTROS: si te doy una lista de refugios o centros (incl. 'refugios cercanos'), enuméralos AQUÍ con su nombre y ubicación, y para cada uno incluye su enlace 'como_llegar' como URL completa (https://…) para que llegue desde su ubicación. NUNCA redirijas a /refugios para esto. " +
          "SOLICITUDES: si te doy una lista de solicitudes, enuméralas AQUÍ con su título, estado (abierta/en progreso/cubierta/cerrada) y avance (cubiertas/total), e incluye SIEMPRE su enlace directo a la página de estado tal cual te lo doy (ej. /solicitud/abc123) para que el usuario haga clic. Si no tiene ninguna, dilo y sugiérele crear una en /solicitudes. " +
          "DONACIONES: si te doy una lista de donaciones del usuario (entidad donacion), enuméralas AQUÍ con su descripción, estado (pendiente/en tránsito/recibido/cancelado) y el centro destino, e incluye su enlace de seguimiento tal cual te lo doy (ej. /donaciones/AB12CD o /mis-donaciones). Si no tiene ninguna, dilo y sugiérele ofrecer ayuda en /ofrecer. " +
          "Si de verdad no hay nada, dilo claro y ofrece una alternativa concreta.\n\n" + GUIA,
      },
      { role: "user", content:
        `Pregunta: ${pregunta}\n\nDatos consultados (con scope por rol):\n${JSON.stringify(datos)}\n\nTextos relacionados:\n${docs.map((d) => `- ${d.contenido}`).join("\n")}` +
        (solicitudes.length ? `\n\nSolicitudes del usuario (con enlace directo a su estado):\n${solicitudes.map((s) => `- "${s.titulo}" — estado: ${s.estado}, ${s.cubiertas}/${s.total} cubiertas${s.hospital ? `, ${s.hospital}` : ""} → ${s.url}`).join("\n")}` : preguntaSolicitudes ? `\n\nSolicitudes del usuario: ninguna encontrada en su alcance.` : "") +
        `\n\nResultados de fuentes externas (JSON):\n${JSON.stringify(externo.resultados)}\n\nEnlaces de referencia:\n${externo.enlaces.map((e) => `- ${e.titulo}: ${e.url}`).join("\n")}` },
    ],
    temperature: 0.2,
  });

  // Si Avi habló de insumos, devolvemos los donables para mostrar el botón "Donar" en el chat.
  const insumos = filtros.entidad === "insumo" ? (datos?.rows ?? []).filter((x: any) => x?.id && x?.hospital_id) : [];
  const resultados = construirResultados(filtros.entidad, datos?.rows ?? [], externo.resultados);
  return { respuesta: r.choices[0]?.message?.content ?? "Sin respuesta.", fuentes: datos?.rows ?? [], externos: externo.resultados, enlaces: externo.enlaces, insumos, resultados };
}

// Tarjeta rica para el chat: el front la pinta con badge de estado y, si trae id, expande a su modal.
export type ResultadoChat = {
  tipo: "persona" | "insumo" | "hospital" | "centro" | "externo" | "solicitud" | "donacion";
  id?: string; titulo: string; estado?: string | null; sub?: string | null; foto?: string | null; url?: string | null;
};

function construirResultados(entidad: string | undefined, rows: any[], externos: any[]): ResultadoChat[] {
  const out: ResultadoChat[] = [];
  const top = rows.slice(0, 6);
  if (entidad === "persona") {
    for (const x of top) out.push({ tipo: "persona", id: x.id, titulo: x.nombre ?? "Sin nombre", estado: x.estado_salud ?? null, sub: x.ubicacion ?? x.hospitales?.nombre ?? null, foto: Array.isArray(x.fotos) ? x.fotos[0] : (x.foto ?? null) });
    for (const e of (externos ?? []).slice(0, 6)) out.push({ tipo: "externo", titulo: e.nombre ?? e.titulo ?? "Resultado externo", estado: "externo", sub: e.fuente ?? e.ubicacion ?? null, foto: e.foto ?? e.imagen ?? null, url: e.url ?? e.enlace ?? null });
  } else if (entidad === "insumo") {
    for (const x of top) out.push({ tipo: "insumo", id: x.id, titulo: x.nombre ?? "Insumo", estado: x.estado ?? null, sub: [x.cantidad, x.hospitales?.nombre].filter(Boolean).join(" · ") || null });
  } else if (entidad === "hospital") {
    for (const x of top) out.push({ tipo: "hospital", id: x.id, titulo: x.nombre ?? "Institución", sub: x.ubicacion ?? null });
  } else if (entidad === "centro") {
    for (const x of top) out.push({ tipo: "centro", id: x.id, titulo: x.nombre ?? "Centro", sub: x.zona ?? x.ubicacion ?? null });
  } else if (entidad === "donacion") {
    for (const x of top) out.push({
      tipo: "donacion",
      titulo: x.descripcion || (x.tipo === "personal_salud" ? "Ofrecimiento de personal" : "Donación"),
      estado: x.entrega_estado ?? x.estatus ?? null,
      sub: [x.cantidad, x.centro].filter(Boolean).join(" · ") || null,
      url: x.url ?? null,
    });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
// GATHER conversacional para CREAR (solicitud o donación) sin dead-ends.
// El estado vive en el cliente (chat-store) y viaja de ida/vuelta en `pendiente`:
// Avi acumula insumos + centro/lugar y, en cuanto los tiene, crea y da el enlace.
// ════════════════════════════════════════════════════════════════════════
export type PendienteChat = {
  flow: "solicitud" | "donacion";
  items: ItemNecesidad[];              // insumos acumulados
  titulo: string | null;
  descripcion: string | null;
  hospitalId: string | null;          // centro resuelto (solicitud)
  hospitalNombre: string | null;
  refugioId: string | null;           // lugar de entrega resuelto (donación)
  refugioNombre: string | null;
  refugio: any | null;                 // fila del refugio (para "cómo llegar")
  falta: "insumos" | "centro" | "entrega" | null;
  centroHint: string | null;          // pista de nombre del centro (1er turno)
};

const norm = (s: string) => (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// ¿El usuario quiere abortar la creación? (para no quedar atrapado en el gather).
function esCancelacion(t: string): boolean {
  return /^\s*(cancela\w*|olvi\w*|d[eé]jal[oa]|deja eso|ya no|mejor no|nada|para|det[eé]n\w*|otra cosa)\b/i.test(t || "");
}

// Une insumos nuevos con los ya acumulados, deduplicando por nombre normalizado.
function mergeItems(prev: ItemNecesidad[], nuevos: ItemNecesidad[]): ItemNecesidad[] {
  const out = [...prev];
  const vistos = new Set(prev.map((i) => norm(i.nombre)));
  for (const n of nuevos) {
    const k = norm(n.nombre);
    if (!vistos.has(k)) { out.push(n); vistos.add(k); }
  }
  return out;
}

const resumenItems = (items: ItemNecesidad[]) =>
  items.map((i) => `${i.cantidad ?? ""}${i.cantidad ? " " : ""}${i.nombre}`.trim()).join(", ");

// Enlace "cómo llegar" a un lugar (con o sin GPS), mismo patrón que consultas.ts.
const comoLlegarLugar = (r: any) =>
  r?.gps_lat != null && r?.gps_lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${r.gps_lat},${r.gps_lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${r?.nombre ?? ""} ${r?.ubicacion ?? r?.zona ?? ""} Venezuela`)}`;

// Bloque de texto con los puntos de entrega (refugios/centros) para un hospital.
function textoEntrega(lugares: any[], centroNombre: string): string {
  if (!lugares.length) return "";
  const lista = lugares.slice(0, 5).map((l) => `- ${l.nombre}${l.ubicacion ? ` (${l.ubicacion})` : ""} → ${comoLlegarLugar(l)}`).join("\n");
  return `\n\n📦 ¿Dónde llevar lo donado a ${centroNombre}? Puntos de entrega cercanos:\n${lista}`;
}

const pend = (estado: PendienteChat, falta: PendienteChat["falta"], respuesta: string): RespuestaChat =>
  ({ respuesta, fuentes: [], pendiente: { ...estado, falta } });

// ── GATHER: crear SOLICITUD (necesidad de un centro) ──
async function gatherSolicitud(pregunta: string, ctx: PendienteChat, hayaSesion: boolean): Promise<RespuestaChat> {
  if (!hayaSesion) return { respuesta: "Para registrar una solicitud necesito que inicies sesión como personal del centro. Entra en /login y seguimos.", fuentes: [], pendiente: null };
  const estado: PendienteChat = { ...ctx };

  // 1) Sumar insumos que traiga este mensaje (inofensivo si no trae ninguno).
  const prep = await prepararSolicitudDesdeTexto(pregunta);
  if (prep.ok) {
    estado.items = mergeItems(estado.items, prep.items);
    estado.titulo = estado.titulo ?? prep.titulo;
    estado.descripcion = estado.descripcion ?? prep.descripcion;
  }

  // 2) Resolver el centro si aún no lo tenemos (pista del clasificador o del propio mensaje).
  let opciones: { id: string; nombre: string }[] = [];
  if (!estado.hospitalId) {
    const res = await resolverHospitalGestionable(estado.centroHint || pregunta);
    if ("match" in res) { estado.hospitalId = res.match.id; estado.hospitalNombre = res.match.nombre; }
    else opciones = res.opciones;
  }
  estado.centroHint = null; // pista consumida

  // 3) ¿Qué falta? Pedirlo conversando (no reiniciar, no "no pude").
  if (!estado.items.length) {
    const paraQuien = estado.hospitalNombre ? ` para ${estado.hospitalNombre}` : "";
    return pend(estado, "insumos", `¡Perfecto! Voy armando la solicitud${paraQuien}. ¿Qué insumos necesitas? Escríbelos con cantidades, por ejemplo: **50 férulas, 20 cajas de guantes**.`);
  }
  if (!estado.hospitalId) {
    if (!opciones.length) return { respuesta: "No encontré ningún centro que gestiones. Pide acceso a tu institución o crea la solicitud desde /solicitudes.", fuentes: [], pendiente: null };
    if (opciones.length === 1) { estado.hospitalId = opciones[0].id; estado.hospitalNombre = opciones[0].nombre; }
    else {
      const lista = opciones.slice(0, 8).map((o) => o.nombre).join(", ");
      return pend(estado, "centro", `Ya tengo ${estado.items.length} insumo(s): ${resumenItems(estado.items)}. ¿Para cuál centro es? Por ejemplo: **Hospital Domingo Luciani**. Gestionas: ${lista}.`);
    }
  }

  // 4) Crear.
  const r = await crearSolicitudConItems({ hospitalId: estado.hospitalId!, items: estado.items, titulo: estado.titulo, descripcion: estado.descripcion });
  if (!r.ok) {
    // Si el problema es el centro, volvemos a preguntarlo (no bloqueamos).
    if (/centro|gestionas/i.test(r.error)) {
      estado.hospitalId = null; estado.hospitalNombre = null;
      return pend(estado, "centro", `No pude usar ese centro (${r.error}). ¿Para cuál de los tuyos lo registro?`);
    }
    return { respuesta: `Ups, ${r.error}`, fuentes: [], pendiente: { ...estado, falta: null } };
  }

  const url = `/solicitud/${r.slug}`;
  const lugares = await lugaresEntrega(estado.hospitalId!).catch(() => []);
  const detalle = [r.creadas && `${r.creadas} necesidad(es)`, r.actualizadas && `${r.actualizadas} actualizada(s)`].filter(Boolean).join(", ");
  const respuesta =
    `¡Listo! Aquí tienes tu nueva solicitud para **${estado.hospitalNombre}**. ✅\n` +
    `Compártela para que cualquiera done directo: ${url}` +
    textoEntrega(lugares, estado.hospitalNombre ?? "el centro") +
    `\n\nToca la tarjeta de abajo para abrirla y seguir su estado.`;
  const resultados: ResultadoChat[] = [{ tipo: "solicitud", id: r.id, titulo: `Solicitud — ${estado.hospitalNombre}`, estado: "abierta", sub: detalle || resumenItems(estado.items), url }];
  return { respuesta, fuentes: [], resultados, pendiente: null };
}

// ── GATHER: registrar DONACIÓN (insumos que el usuario ENTREGA) ──
async function gatherDonacion(pregunta: string, ctx: PendienteChat): Promise<RespuestaChat> {
  const estado: PendienteChat = { ...ctx };

  // 1) Sumar productos que traiga este mensaje.
  const prep = await prepararSolicitudDesdeTexto(pregunta);
  if (prep.ok) {
    estado.items = mergeItems(estado.items, prep.items);
    estado.titulo = estado.titulo ?? prep.titulo;
  }

  // 2) Resolver el LUGAR de entrega (cualquier centro de acopio/refugio) por nombre.
  let centros: any[] = [];
  if (!estado.refugioId) {
    centros = await listarCentrosEntrega().catch(() => []);
    const hint = norm(estado.centroHint || pregunta);
    if (hint && centros.length) {
      const toks = hint.split(" ").filter((t) => t.length > 2);
      const scored = centros
        .map((c) => {
          const h = norm(c.nombre);
          let score = 0;
          if (h === hint) score = 100;
          else if (hint.includes(h)) score = 60;
          else score = toks.filter((t) => h.includes(t)).length;
          return { c, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
        estado.refugio = scored[0].c; estado.refugioId = scored[0].c.id; estado.refugioNombre = scored[0].c.nombre;
      }
    }
  }
  estado.centroHint = null;

  // 3) ¿Qué falta?
  if (!estado.items.length) {
    return pend(estado, "insumos", "¡Genial que quieras donar! 💜 ¿Qué vas a donar? Escríbelo con cantidades, por ejemplo: **30 cajas de guantes, 10 férulas**.");
  }
  if (!estado.refugioId) {
    if (!centros.length) centros = await listarCentrosEntrega().catch(() => []);
    const lista = centros.slice(0, 8).map((c) => c.nombre).join(", ");
    const ejemplo = centros[0]?.nombre ?? "Parque del Este";
    return pend(estado, "entrega", `Perfecto, anoté: ${resumenItems(estado.items)}. ¿En qué centro de acopio o refugio lo entregarás? Por ejemplo: **${ejemplo}**.${lista ? ` Opciones: ${lista}.` : ""}`);
  }

  // 4) Crear la(s) oferta(s) — una por producto, todas al mismo lugar de entrega.
  const itemsDon = estado.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, presentacion: i.presentacion, area: i.area }));
  const r = await crearOfertasMixtas(itemsDon, { refugio_id: estado.refugioId! });
  if (!r.ok) {
    // Anónimo sin teléfono: no es un dead-end, lo mandamos al form que sí capta contacto.
    if (/tel[eé]fono|contacto/i.test(r.error)) {
      return { respuesta: "Ya casi. Para coordinar la entrega necesito un teléfono de contacto. Complétala en /ofrecer (ahí guardas tu contacto) o inicia sesión y te la registro aquí mismo.", fuentes: [], pendiente: null };
    }
    return { respuesta: `Ups, ${r.error}`, fuentes: [], pendiente: { ...estado, falta: null } };
  }

  const codigo = r.codigos[0];
  const url = codigo ? `/donaciones/${codigo}` : "/mis-donaciones";
  const comoLlegar = comoLlegarLugar(estado.refugio);
  const respuesta =
    `¡Gracias por donar! 💜 Registré tu donación${r.creadas > 1 ? ` (${r.creadas} productos)` : ""}.\n` +
    `📍 Entrégala en **${estado.refugioNombre}**${estado.refugio?.ubicacion ? ` (${estado.refugio.ubicacion})` : ""} → ${comoLlegar}\n` +
    `Sigue su estado aquí: ${url}`;
  const resultados: ResultadoChat[] = [{ tipo: "donacion", titulo: `Donación — ${estado.refugioNombre}`, estado: "pendiente", sub: resumenItems(estado.items), url }];
  return { respuesta, fuentes: [], resultados, pendiente: null };
}
