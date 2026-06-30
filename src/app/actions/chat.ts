"use server";

import OpenAI from "openai";
import { createAdminClient, getSesion } from "@/lib/supabase/server";
import { transcribirAudio } from "@/lib/ai/vision";
import { buscarExterno } from "@/app/actions/externos";
import { consultarEntidad } from "@/app/actions/consultas";
import { estadoSolicitudesParaChat } from "@/app/actions/solicitudes";

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

// Chatbot RAG sobre datos estructurados: parsea -> consulta Postgres -> redacta.
export async function preguntar(pregunta: string): Promise<{ respuesta: string; fuentes: any[]; externos?: any[]; enlaces?: { titulo: string; url: string }[]; insumos?: any[]; resultados?: ResultadoChat[] }> {
  if (!pregunta?.trim()) return { respuesta: "Hazme una pregunta.", fuentes: [] };

  // Contexto del usuario para que Avi hable mejor y tenga claros sus permisos.
  const sesion = await getSesion();
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
          '{"tipo":"datos|ayuda","entidad":"hospital|refugio|insumo|centro|persona|solicitud|null","nombre":string|null,"ubicacion":string|null,"hospital":string|null,"estado":"vivo|herido|desaparecido|fallecido"|null}. ' +
          '"datos" = pide información concreta (refugios cercanos, quién es el responsable, dónde queda, qué insumos faltan, buscar a una persona, el estado de las solicitudes). ' +
          'entidad="solicitud" cuando pregunte por el ESTADO de sus solicitudes/pedidos/paquetes de necesidades o cómo van (ej. "¿cuál es el estado de mis solicitudes?", "¿cómo van mis pedidos?"). ' +
          '"ayuda" = cómo USAR la plataforma (cómo donar, cómo reportar). ' +
          "entidad: hospital (centro de salud/clínica: responsable/ubicación), refugio (refugios/albergues y refugios CERCANOS a un hospital), insumo (qué falta), centro (centro de acopio), persona (buscar a alguien). " +
          'nombre = nombre del refugio/centro/persona. hospital = nombre del hospital/clínica mencionado (p. ej. "refugios cerca del hospital Razetti" -> entidad="refugio", hospital="Razetti").',
      },
      { role: "user", content: pregunta },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  let filtros: any = {};
  try { filtros = JSON.parse(f.choices[0]?.message?.content ?? "{}"); } catch {}

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
  tipo: "persona" | "insumo" | "hospital" | "centro" | "externo";
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
  }
  return out;
}
