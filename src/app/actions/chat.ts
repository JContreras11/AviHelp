"use server";

import OpenAI from "openai";
import { createAdminClient, getSesion } from "@/lib/supabase/server";
import { transcribirAudio } from "@/lib/ai/vision";
import { buscarExterno } from "@/app/actions/externos";
import { consultarEntidad } from "@/app/actions/consultas";

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
- BUSCAR PERSONA: pregúntame el nombre o la cédula; también /desaparecidos lista a los reportados como desaparecidos.
- REFUGIOS: /refugios. PANEL de situación: /dashboard.
- PERSONAL DE CENTRO DE SALUD: abre un insumo y actualiza su estatus (Pendiente → En tránsito → Recibido).
- COORDINADOR / personal que gestiona donaciones: la bandeja de emparejamientos sugeridos por IA está en /admin/triage; ahí aprueba o rechaza.
Cuando expliques cómo hacer algo, da pasos cortos e incluye el enlace interno (ej. /ofrecer).`;

// Chatbot RAG sobre datos estructurados: parsea -> consulta Postgres -> redacta.
export async function preguntar(pregunta: string): Promise<{ respuesta: string; fuentes: any[]; externos?: any[]; enlaces?: { titulo: string; url: string }[] }> {
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
          '{"tipo":"datos|ayuda","entidad":"hospital|insumo|centro|persona|null","nombre":string|null,"ubicacion":string|null,"estado":"vivo|herido|desaparecido|fallecido"|null}. ' +
          '"datos" = pide información concreta (quién es el responsable, dónde queda, qué insumos faltan, buscar a una persona, datos de un hospital/centro). ' +
          '"ayuda" = cómo USAR la plataforma (cómo donar, cómo reportar, dónde hacer algo). ' +
          "entidad: hospital (centro de salud/clínica/refugio: responsable, ubicación, necesidades), insumo (qué falta/necesidades), centro (centro de acopio), persona (buscar a alguien). nombre = nombre del hospital/centro/persona mencionado.",
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
    datos = await consultarEntidad(filtros.entidad, { nombre: filtros.nombre, ubicacion: filtros.ubicacion, estado: filtros.estado });
    // Persona sin resultado local -> fuentes externas en vivo + enlaces clicables.
    if (filtros.entidad === "persona" && (datos?.rows?.length ?? 0) === 0) {
      externo = await buscarExterno(filtros.nombre || pregunta);
    }
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
          "Si de verdad no hay nada, dilo claro y ofrece una alternativa concreta.\n\n" + GUIA,
      },
      { role: "user", content:
        `Pregunta: ${pregunta}\n\nDatos consultados (con scope por rol):\n${JSON.stringify(datos)}\n\nTextos relacionados:\n${docs.map((d) => `- ${d.contenido}`).join("\n")}` +
        `\n\nResultados de fuentes externas (JSON):\n${JSON.stringify(externo.resultados)}\n\nEnlaces de referencia:\n${externo.enlaces.map((e) => `- ${e.titulo}: ${e.url}`).join("\n")}` },
    ],
    temperature: 0.2,
  });

  return { respuesta: r.choices[0]?.message?.content ?? "Sin respuesta.", fuentes: datos?.rows ?? [], externos: externo.resultados, enlaces: externo.enlaces };
}
