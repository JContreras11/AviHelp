import OpenAI from "openai";

// Cliente OpenRouter (API compatible OpenAI).
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
});

const MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash-lite";
const MODEL_HQ = process.env.OPENROUTER_VISION_MODEL_HQ ?? "google/gemini-2.5-flash";
// PDF/Excel/texto suelen ser listas largas: arrancan con el modelo HQ (el lite trunca/falla el JSON).
const MODEL_TEXTO = process.env.OPENROUTER_TEXT_MODEL ?? MODEL_HQ;
const UMBRAL_CONFIANZA = 0.5;
// Listas largas (PDF de pacientes) generan JSON grande. Gemini 2.5 flash admite ~65k de salida.
const MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS ?? 32000);

// Parseo robusto: salva respuestas con ```fences``` o texto alrededor del objeto.
function parsearJSON(s: string): any | null {
  if (!s?.trim()) return null;
  try { return JSON.parse(s); } catch { /* sigue */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* sigue */ } }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* sigue */ } }
  return null;
}

// ── Modelo de datos unificado que la IA debe poblar ──
export type PersonaExtraida = {
  nombre: string | null;
  cedula: string | null;
  edad: number | null;
  sexo: "M" | "F" | "O" | "desconocido" | null;
  ubicacion: string | null;
  estado_salud: "vivo" | "herido" | "desaparecido" | "fallecido" | "desconocido" | null;
  descripcion_fisica: string | null;
  telefono_contacto: string | null;
  contacto_nombre: string | null;
  notas: string | null;
};
export type InsumoExtraido = {
  nombre: string;
  cantidad: number | null;
  unidad: string | null;            // dosis/medida: mg, ml, mcg...
  presentacion: string | null;      // frasco, tableta, vial, ampolla, polvo, otro
  area: string | null;              // Trauma, Neonato, Cirugía, Pediatría...
  para_que_sirve: string | null;    // indicación breve (saber qué es)
  alternativas: string | null;      // sustitutos si no se consigue
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
- lista de nombres con estado entre paréntesis: (DESAPARECIDO), (HERIDO), (ASESINADO), (MENOR DE EDAD).
- lista de insumos médicos faltantes de un hospital (escrita a mano, pegada en pared).
- otro.

REGLAS:
1. Clasifica el documento en "tipo".
2. Extrae la MÁXIMA información posible. NO inventes: si un dato no está o no es legible, usa null. NO completes datos que no veas.
2b. CÉDULA: solo es cédula un número de 6+ dígitos (a veces con prefijo V-, E-, J-, G-). NUNCA confundas edad ni sexo con cédula: si junto al nombre solo ves algo como "25F", "30M" o un número de 1-3 dígitos, eso es EDAD y SEXO -> rellena edad y sexo y deja cedula=null. No pongas la edad en cedula.
2f. Las listas suelen estar escritas a mano en LETRA DE MOLDE (mayúsculas) y organizadas por filas; procesa fila por fila de arriba a abajo, una persona por fila. Ignora tachones y números de orden (1., 2., ...). Respeta tildes y la Ñ.
2c. Para insumos médicos extrae por SEPARADO: "cantidad" (solo el número), "unidad" (dosis/medida si la hay: mg, ml, mcg, UI), y "presentacion" (forma farmacéutica: frasco, tableta, vial, ampolla, polvo, comprimido, jarabe, solución, otro). Ej "3 frascos de Cefazolina 1g" -> cantidad=3, presentacion="frasco", unidad="1g", nombre="Cefazolina".
2d. Si la lista está agrupada por secciones/áreas del hospital (Trauma, Neonato, Cirugía, Pediatría, Politrauma, Quirófano, Terapia, etc.), pon esa sección en "area" de cada insumo de ese bloque.
2e. Como apoyo clínico, si reconoces el medicamento, rellena "para_que_sirve" (indicación en pocas palabras) y "alternativas" (sustitutos equivalentes habituales). Si no estás seguro, usa null. NUNCA inventes dosis.
3. Infiere "estado_salud" del CONTEXTO: "pacientes ingresados/heridos"->"herido"; cartel de desaparecido->"desaparecido"; (ASESINADO)->"fallecido"; cédula sola->"desconocido". Mapea sinónimos al enum exacto.
4. Captura teléfonos (telefono_contacto), quién reporta (contacto_nombre), tatuajes/señas en descripcion_fisica, y cualquier extra en notas.
5. Si detectas el NOMBRE de la institución de salud, llénalo en "hospital". Cuenta CUALQUIER centro: hospital, clínica, instituto médico, ambulatorio, centro de salud o refugio (ej. "Hospital Domingo Luciani", "Instituto Médico La Floresta", "Clínica La Floresta"). Vale aunque venga como arroba/usuario de red social (ej. "@clinicalafloresta" -> "Clínica La Floresta") o en el encabezado/firma del mensaje.
6. "contexto" = título/encabezado o resumen de qué es el documento.
7. confianza (0..1) = qué tan seguro estás de la lectura global. legible=false si está borroso/ilegible.

Responde SOLO JSON con esta forma exacta:
{"legible":bool,"confianza":number,"motivo_ilegible":string|null,
 "tipo":"cedula|lista_pacientes|cartel_desaparecidos|lista_estado|lista_insumos|otro",
 "contexto":string|null,
 "hospital":{"nombre":string|null,"ubicacion":string|null}|null,
 "personas":[{"nombre":string|null,"cedula":string|null,"edad":int|null,"sexo":"M|F|O|desconocido"|null,"ubicacion":string|null,"estado_salud":"vivo|herido|desaparecido|fallecido|desconocido"|null,"descripcion_fisica":string|null,"telefono_contacto":string|null,"contacto_nombre":string|null,"notas":string|null}],
 "insumos":[{"nombre":string,"cantidad":number|null,"unidad":string|null,"presentacion":string|null,"area":string|null,"para_que_sirve":string|null,"alternativas":string|null,"prioridad":"baja|media|alta|critica"|null}]}`;

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
    max_tokens: MAX_TOKENS,
  });
  const content = res.choices[0]?.message?.content ?? "";
  const raw = parsearJSON(content);
  if (!raw) {
    const motivoCorte = (res.choices[0] as any)?.finish_reason === "length" ? " (respuesta cortada por longitud)" : "";
    console.error(`[vision] IA no parseable modelo=${modelo} len=${content.length} head=${content.slice(0, 200)}`);
    return { raw: {}, legible: false, confianza: 0, motivo: `Respuesta IA no parseable${motivoCorte}.` };
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
  modeloInicial: string = MODEL,
): Promise<Resultado<DocumentoAnalizado>> {
  let modelo = modeloInicial;
  let r = await llamarCon(contenido, modelo);
  if (r.legible && r.confianza < UMBRAL_CONFIANZA && modelo !== MODEL_HQ) {
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

// Transcribe audio (base64) a texto vía OpenRouter (Gemini acepta audio). format: 'webm'|'wav'|'mp3'|'ogg'|'mp4'.
export async function transcribirAudio(base64: string, format: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL_HQ, // flash maneja mejor el audio
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe este audio en español. Devuelve SOLO el texto dicho, sin comillas ni comentarios." },
          // @ts-expect-error input_audio es válido en OpenRouter (compat OpenAI), no en los tipos del SDK
          { type: "input_audio", input_audio: { data: base64, format } },
        ],
      },
    ],
    temperature: 0,
  });
  return (res.choices[0]?.message?.content ?? "").trim();
}

// Texto (PDF/Excel/dictado): mismo cerebro, sin imagen. Arranca con el modelo HQ
// porque suelen ser listas largas que el modelo lite trunca o devuelve mal.
export function analizarTexto(texto: string) {
  return ejecutar(
    [{ type: "text", text: `Texto extraído de un documento (PDF, Excel o dictado). Procesa TODAS las filas:\n"""${texto}"""\nExtrae las entidades y devuelve el JSON.` }],
    "No se pudo interpretar el documento. Revisa que tenga una lista legible.",
    MODEL_TEXTO,
  );
}
