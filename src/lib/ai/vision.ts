import OpenAI from "openai";

// Cliente OpenRouter (API compatible OpenAI).
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
});

const MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash-lite";
const MODEL_HQ = process.env.OPENROUTER_VISION_MODEL_HQ ?? "google/gemini-2.5-flash";
const UMBRAL_CONFIANZA = 0.5;

// ── Modelo de datos unificado que la IA debe poblar ──
export type PersonaExtraida = {
  nombre: string | null;
  cedula: string | null;
  edad: number | null;
  sexo: "M" | "F" | "O" | "desconocido" | null;
  ubicacion: string | null;
  estado_salud: "vivo" | "herido" | "desaparecido" | "detenido" | "fallecido" | "desconocido" | null;
  descripcion_fisica: string | null;
  telefono_contacto: string | null;
  contacto_nombre: string | null;
  notas: string | null;
};
export type InsumoExtraido = {
  nombre: string;
  cantidad: number | null;
  unidad: string | null;
  prioridad: "baja" | "media" | "alta" | "critica" | null;
};
export type TipoDocumento =
  | "cedula" | "lista_pacientes" | "cartel_desaparecidos"
  | "lista_estado" | "lista_insumos" | "otro";

export type DocumentoAnalizado = {
  tipo: TipoDocumento;
  contexto: string | null; // ej. "Pacientes ingresados por sismo 24/6/2026"
  hospital: { nombre: string | null; ubicacion: string | null } | null;
  personas: PersonaExtraida[];
  insumos: InsumoExtraido[];
};

export type Resultado<T> =
  | { ok: true; data: T; confianza: number; modelo: string }
  | { ok: false; motivo: string };

const PROMPT = `Eres el cerebro de una plataforma de emergencias humanitarias. Recibes UNA imagen que puede ser de cualquier tipo:
- cédula de identidad (extrae nombre completo, número de cédula, fecha de nacimiento->edad, sexo, nacionalidad).
- lista de pacientes ingresados escrita a mano (cada fila es una persona herida/ingresada).
- cartel o collage de personas desaparecidas (nombre, teléfonos de contacto, descripción física, tatuajes, dónde fue visto, quién reporta).
- lista de nombres con estado entre paréntesis: (DESAPARECIDO), (DETENIDO), (HERIDO), (ASESINADO), (MENOR DE EDAD).
- lista de insumos médicos faltantes de un hospital (escrita a mano, pegada en pared).
- otro.

REGLAS:
1. Clasifica el documento en "tipo".
2. Extrae la MÁXIMA información posible. NO inventes: si un dato no está o no es legible, usa null. NO completes datos que no veas.
2b. SIEMPRE intenta extraer la cédula/ID de cada persona si aparece en cualquier formato (V-, E-, J-, números sueltos junto al nombre). Es el dato más importante para identificar.
2c. Para insumos, extrae cantidad y unidad cuando estén escritas (ej. "200 unidades", "varios", "diferentes medidas" -> unidad="varios"). Si solo hay nombre, deja cantidad/unidad en null.
3. Infiere "estado_salud" del CONTEXTO: "pacientes ingresados/heridos"->"herido"; cartel de desaparecido->"desaparecido"; (ASESINADO)->"fallecido"; (DETENIDO)->"detenido"; cédula sola->"desconocido". Mapea sinónimos al enum exacto.
4. Captura teléfonos (telefono_contacto), quién reporta (contacto_nombre), tatuajes/señas en descripcion_fisica, y cualquier extra en notas.
5. Si detectas un hospital (ej. "Hospital Domingo Luciani"), llénalo en "hospital".
6. "contexto" = título/encabezado o resumen de qué es el documento.
7. confianza (0..1) = qué tan seguro estás de la lectura global. legible=false si está borroso/ilegible.

Responde SOLO JSON con esta forma exacta:
{"legible":bool,"confianza":number,"motivo_ilegible":string|null,
 "tipo":"cedula|lista_pacientes|cartel_desaparecidos|lista_estado|lista_insumos|otro",
 "contexto":string|null,
 "hospital":{"nombre":string|null,"ubicacion":string|null}|null,
 "personas":[{"nombre":string|null,"cedula":string|null,"edad":int|null,"sexo":"M|F|O|desconocido"|null,"ubicacion":string|null,"estado_salud":"vivo|herido|desaparecido|detenido|fallecido|desconocido"|null,"descripcion_fisica":string|null,"telefono_contacto":string|null,"contacto_nombre":string|null,"notas":string|null}],
 "insumos":[{"nombre":string,"cantidad":number|null,"unidad":string|null,"prioridad":"baja|media|alta|critica"|null}]}`;

type Contenido =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function llamarCon(contenido: Contenido[], modelo: string) {
  const res = await client.chat.completions.create({
    model: modelo,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: contenido },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  let raw: any = {};
  try {
    raw = JSON.parse(res.choices[0]?.message?.content ?? "{}");
  } catch {
    return { raw: {}, legible: false, confianza: 0, motivo: "Respuesta IA no parseable." };
  }
  return {
    raw,
    legible: raw.legible !== false,
    confianza: typeof raw.confianza === "number" ? raw.confianza : 0,
    motivo: raw.motivo_ilegible ?? undefined,
  };
}

function normalizar(raw: any, r: { confianza: number }, modelo: string): Resultado<DocumentoAnalizado> {
  const data: DocumentoAnalizado = {
    tipo: raw.tipo ?? "otro",
    contexto: raw.contexto ?? null,
    hospital: raw.hospital?.nombre ? raw.hospital : null,
    personas: Array.isArray(raw.personas) ? raw.personas : [],
    insumos: Array.isArray(raw.insumos) ? raw.insumos : [],
  };
  return { ok: true, data, confianza: r.confianza, modelo };
}

async function ejecutar(
  contenido: Contenido[],
  rechazo: string,
): Promise<Resultado<DocumentoAnalizado>> {
  let modelo = MODEL;
  let r = await llamarCon(contenido, modelo);
  if (r.legible && r.confianza < UMBRAL_CONFIANZA) {
    modelo = MODEL_HQ;
    r = await llamarCon(contenido, modelo);
  }
  if (!r.legible || r.confianza < UMBRAL_CONFIANZA)
    return { ok: false, motivo: r.motivo ?? rechazo };
  return normalizar(r.raw, r, modelo);
}

// Imagen: clasifica + extrae. Escala a modelo HQ si la confianza es baja.
export function analizarDocumento(dataUrl: string) {
  return ejecutar(
    [
      { type: "text", text: "Analiza esta imagen y devuelve el JSON." },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
    "Por favor, sube una imagen más clara.",
  );
}

// Texto (audio transcrito / dictado): mismo cerebro, sin imagen.
export function analizarTexto(texto: string) {
  return ejecutar(
    [{ type: "text", text: `Texto dictado o transcrito de un voluntario:\n"""${texto}"""\nExtrae las entidades y devuelve el JSON.` }],
    "No se entendió el audio. Intenta de nuevo, más claro.",
  );
}
