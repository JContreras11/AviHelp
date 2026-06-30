import OpenAI from "openai";

// Cliente OpenRouter (API compatible OpenAI). LAZY a propósito: este módulo exporta también
// helpers puros (categoriaDoc) y tipos que importa un Client Component ("use client": DocCard).
// Si construyéramos el cliente al cargar el módulo, en el bundle de cliente
// `process.env.OPENROUTER_API_KEY` es undefined (no es NEXT_PUBLIC) y el SDK de OpenAI lanza
// "Missing credentials" al EVALUAR el módulo — esto tumbaba la home autenticada (que renderiza
// <Captura> -> DocCard). Construyéndolo bajo demanda, solo corre en el servidor al analizar.
let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
    });
  }
  return _client;
}

const MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash-lite";
const MODEL_HQ = process.env.OPENROUTER_VISION_MODEL_HQ ?? "google/gemini-2.5-flash";
// PDF/Excel/texto suelen ser listas largas: arrancan con el modelo HQ (el lite trunca/falla el JSON).
const MODEL_TEXTO = process.env.OPENROUTER_TEXT_MODEL ?? MODEL_HQ;
const UMBRAL_CONFIANZA = 0.5;
// Listas largas (PDF de pacientes) generan JSON grande. Gemini 2.5 flash admite ~65k de salida.
// Se sube el tope por defecto para que una página densa de 14+ pacientes no se trunque a media lista.
const MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS ?? 48000);

// Extrae los objetos {…} COMPLETOS de dentro de un array JSON (texto que empieza tras el "[").
// Tolera truncación: si el último objeto quedó a medias (respuesta cortada), se descarta y se
// conservan TODOS los anteriores. Así una página con 14 personas no se pierde por culpa de la #14.
function extraerObjetos(arrText: string): any[] {
  const out: any[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < arrText.length; i++) {
    const ch = arrText[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(arrText.slice(start, i + 1))); } catch { /* objeto roto: ignora */ }
        start = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  return out;
}

// Localiza el array de una clave ("personas"/"insumos") y devuelve sus objetos completos.
function extraerArray(s: string, key: string): any[] {
  const re = new RegExp(`"${key}"\\s*:\\s*\\[`);
  const m = s.match(re);
  if (!m || m.index == null) return [];
  return extraerObjetos(s.slice(m.index + m[0].length));
}

// Última red: la respuesta llegó CORTADA por longitud (JSON inválido). En vez de tirar TODO
// ("Respuesta IA no parseable"), rescatamos las personas/insumos que sí están completas y los
// campos escalares de cabecera. Esto convierte fallos totales en lecturas parciales revisables.
function repararTruncado(s: string): any | null {
  const personas = extraerArray(s, "personas");
  const insumos = extraerArray(s, "insumos");
  const obj: any = { personas, insumos };
  const tipo = s.match(/"tipo"\s*:\s*"([^"]*)"/); if (tipo) obj.tipo = tipo[1];
  const ctx = s.match(/"contexto"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (ctx) obj.contexto = ctx[1];
  const conf = s.match(/"confianza"\s*:\s*([0-9.]+)/); if (conf) obj.confianza = Number(conf[1]);
  const leg = s.match(/"legible"\s*:\s*(true|false)/); if (leg) obj.legible = leg[1] === "true";
  const hosp = s.match(/"hospital"\s*:\s*(\{[^}]*\})/); if (hosp) { try { obj.hospital = JSON.parse(hosp[1]); } catch { /* */ } }
  // Solo vale si rescatamos ALGO útil; si no, que el llamador escale o rechace.
  if (!personas.length && !insumos.length && obj.tipo === undefined) return null;
  obj.legible = obj.legible !== false; // truncado pero con datos = legible
  obj.__reparado = true;
  return obj;
}

// Parseo robusto: salva respuestas con ```fences```, texto alrededor del objeto, o JSON truncado.
function parsearJSON(s: string): any | null {
  if (!s?.trim()) return null;
  try { return JSON.parse(s); } catch { /* sigue */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* sigue */ } }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* sigue */ } }
  // Nada parseó limpio -> intenta rescatar de una respuesta cortada.
  return repararTruncado(a >= 0 ? s.slice(a) : s);
}

// ── Modelo de datos unificado que la IA debe poblar ──
export type PersonaExtraida = {
  nombre: string | null;
  cedula: string | null;
  edad: number | null;
  sexo: "M" | "F" | "desconocido" | null;
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
  // id: institución existente ya emparejada (link directo, sin duplicar). null = crear nueva.
  hospital: { id?: string | null; nombre: string | null; ubicacion: string | null } | null;
  personas: PersonaExtraida[];
  insumos: InsumoExtraido[];
};

// Categoría de la carga, para agrupar/filtrar "Mis cargas" y mostrarla siempre en la tarjeta.
export type Categoria = "personas" | "insumos" | "donaciones";

// Infiere la categoría a partir de lo que la IA extrajo (insumos vs. personas), con el "tipo"
// como respaldo cuando la lista vino vacía. "donaciones" no la produce la visión (flujo aparte),
// pero el tipo lo admite para clasificaciones manuales.
export function categoriaDoc(d: Pick<DocumentoAnalizado, "tipo" | "personas" | "insumos">): Categoria {
  if (d.insumos?.length) return "insumos";
  if (d.personas?.length) return "personas";
  if (d.tipo === "lista_insumos") return "insumos";
  return "personas";
}

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
2a. COMPLETITUD (CRÍTICO): incluye SIEMPRE a TODAS las personas/filas del documento, una por una, de la primera a la ÚLTIMA, sin saltarte ninguna. Si una fila tiene algún dato ilegible, igual incluye a esa persona con los campos que falten en null — NUNCA la omitas. Una lista de 14 filas debe devolver 14 personas.
2b. CÉDULA (PRIORIDAD MÁXIMA): captura SIEMPRE el número de cédula cuando aparezca; es el dato más importante para identificar a la persona. Es cédula un número de 6+ dígitos (a veces con prefijo V-, E-, J-, G-, o con puntos: "V-12.345.678"). Cópialo COMPLETO, sin perder dígitos. NUNCA confundas edad ni sexo con cédula: si junto al nombre solo ves algo como "25F", "30M" o un número de 1-3 dígitos, eso es EDAD y SEXO -> rellena edad y sexo y deja cedula=null. No pongas la edad en cedula.
2g. NOMBRE: captura SIEMPRE el nombre completo de cada persona (nombres y apellidos tal como aparezcan). El nombre es obligatorio para registrar a la persona; si la fila tiene cédula pero el nombre es dudoso, transcribe tu mejor lectura del nombre igualmente (no lo dejes en null salvo que de verdad no haya ningún nombre escrito).
2f. Las listas suelen estar escritas a mano en LETRA DE MOLDE (mayúsculas) y organizadas por filas; procesa fila por fila de arriba a abajo, una persona por fila. Ignora tachones y números de orden (1., 2., ...). Respeta tildes y la Ñ.
2c. Para insumos médicos extrae por SEPARADO: "cantidad" (solo el número), "unidad" (dosis/medida si la hay: mg, ml, mcg, UI), y "presentacion" (forma farmacéutica: frasco, tableta, vial, ampolla, polvo, comprimido, jarabe, solución, otro). Ej "3 frascos de Cefazolina 1g" -> cantidad=3, presentacion="frasco", unidad="1g", nombre="Cefazolina".
2d. Si la lista está agrupada por secciones/áreas del hospital (Trauma, Neonato, Cirugía, Pediatría, Politrauma, Quirófano, Terapia, etc.), pon esa sección en "area" de cada insumo de ese bloque.
2e. Como apoyo clínico, si reconoces el medicamento, rellena "para_que_sirve" (indicación en pocas palabras) y "alternativas" (sustitutos equivalentes habituales). Si no estás seguro, usa null. NUNCA inventes dosis.
3b. SEXO: SIEMPRE "M" o "F" (uno de los dos, nunca null, "desconocido" ni "O"). Si no hay marca explícita (ej. "25F", "30M"), INFIÉRELO del nombre de pila eligiendo la opción MÁS probable (nombres típicamente masculinos->"M", femeninos->"F"); si es unisex, elige la más común para ese nombre.
3. estado_salud: por DEFECTO "desconocido". NUNCA inventes el estado de una persona (dar por "vivo", "herido", etc. sin base puede crear falsas esperanzas o información falsa). Marca un estado distinto SOLO si el documento lo dice EXPLÍCITAMENTE: una columna/etiqueta de estado, o paréntesis tipo (HERIDO)/(DESAPARECIDO)/(ASESINADO)/(FALLECIDO), o el ENCABEZADO/título deja claro el grupo de TODA la lista (ej. "pacientes ingresados/heridos"->"herido"; "cartel/lista de desaparecidos"->"desaparecido"; "(ASESINADO/FALLECIDO)"->"fallecido"). "vivo" SOLO si el documento afirma explícitamente que está viva/a salvo/ubicada con vida — jamás por suposición. Una lista de solo nombres y/o cédulas, SIN estado explícito, es SIEMPRE "desconocido". Ante cualquier duda: "desconocido".
4. Captura teléfonos (telefono_contacto), quién reporta (contacto_nombre), tatuajes/señas en descripcion_fisica, y cualquier extra en notas.
5. Si detectas el NOMBRE de la institución de salud, llénalo en "hospital". Cuenta CUALQUIER centro: hospital, clínica, instituto médico, ambulatorio, centro de salud o refugio (ej. "Hospital Domingo Luciani", "Instituto Médico La Floresta", "Clínica La Floresta"). Vale aunque venga como arroba/usuario de red social (ej. "@clinicalafloresta" -> "Clínica La Floresta") o en el encabezado/firma del mensaje.
6. "contexto" = título/encabezado o resumen de qué es el documento.
7. confianza (0..1) = qué tan seguro estás de la lectura global. legible=false si está borroso/ilegible.

Responde SOLO JSON con esta forma exacta:
{"legible":bool,"confianza":number,"motivo_ilegible":string|null,
 "tipo":"cedula|lista_pacientes|cartel_desaparecidos|lista_estado|lista_insumos|otro",
 "contexto":string|null,
 "hospital":{"nombre":string|null,"ubicacion":string|null}|null,
 "personas":[{"nombre":string|null,"cedula":string|null,"edad":int|null,"sexo":"M|F","ubicacion":string|null,"estado_salud":"vivo|herido|desaparecido|fallecido|desconocido"|null,"descripcion_fisica":string|null,"telefono_contacto":string|null,"contacto_nombre":string|null,"notas":string|null}],
 "insumos":[{"nombre":string,"cantidad":number|null,"unidad":string|null,"presentacion":string|null,"area":string|null,"para_que_sirve":string|null,"alternativas":string|null,"prioridad":"baja|media|alta|critica"|null}]}`;

type Contenido =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type Lectura = {
  raw: any;
  parseOk: boolean;
  truncado: boolean;
  reparado: boolean;
  legible: boolean;
  confianza: number;
  motivo?: string;
};

async function llamarCon(contenido: Contenido[], modelo: string): Promise<Lectura> {
  const res = await client().chat.completions.create({
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
  const truncado = (res.choices[0] as any)?.finish_reason === "length";
  const raw = parsearJSON(content);
  if (!raw) {
    console.error(`[vision] IA no parseable modelo=${modelo} trunc=${truncado} len=${content.length} head=${content.slice(0, 200)}`);
    const motivoCorte = truncado ? " (respuesta cortada por longitud)" : "";
    return { raw: {}, parseOk: false, truncado, reparado: false, legible: false, confianza: 0, motivo: `Respuesta IA no parseable${motivoCorte}.` };
  }
  return {
    raw,
    parseOk: true,
    truncado,
    reparado: raw.__reparado === true,
    legible: raw.legible !== false,
    confianza: typeof raw.confianza === "number" ? raw.confianza : 0,
    motivo: raw.motivo_ilegible ?? undefined,
  };
}

// Cuántas entidades trae una lectura (para elegir la mejor entre lite y HQ).
function cuentaEntidades(r: Lectura): number {
  const p = Array.isArray(r.raw?.personas) ? r.raw.personas.length : 0;
  const i = Array.isArray(r.raw?.insumos) ? r.raw.insumos.length : 0;
  return p + i;
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

  // Escala al modelo HQ si la primera lectura es floja: no parseó, se cortó/se reparó,
  // salió ilegible, o la confianza es baja. El HQ trunca menos y lee mejor la letra a mano.
  const floja = !r.parseOk || r.truncado || r.reparado || !r.legible || r.confianza < UMBRAL_CONFIANZA;
  if (floja && modelo !== MODEL_HQ) {
    const r2 = await llamarCon(contenido, MODEL_HQ);
    // Nos quedamos con la mejor: prioriza parseo limpio (no reparado) y MÁS entidades.
    const mejor =
      (r2.parseOk && !r.parseOk) ||
      (r2.parseOk && r.reparado && !r2.reparado) ||
      (r2.parseOk && cuentaEntidades(r2) > cuentaEntidades(r));
    if (mejor) { r = r2; modelo = MODEL_HQ; }
  }

  if (!r.parseOk) return { ok: false, motivo: r.motivo ?? rechazo };

  // CLAVE: si extrajimos personas/insumos, NUNCA descartamos por confianza baja ni por una
  // marca de "ilegible" dudosa: devolvemos los datos para que la persona los revise y corrija
  // (la tarjeta muestra la confianza). Solo se rechaza cuando NO hay nada que mostrar.
  const algo = cuentaEntidades(r) > 0;
  if (!algo && (!r.legible || r.confianza < UMBRAL_CONFIANZA))
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
  const res = await client().chat.completions.create({
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
