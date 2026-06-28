import OpenAI from "openai";

// Cliente OpenRouter (mismo patrón que vision.ts).
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
});
const MODEL = process.env.OPENROUTER_MATCH_MODEL ?? process.env.OPENROUTER_VISION_MODEL_HQ ?? "google/gemini-2.5-flash";

export type OfertaCtx = { tipo: string; descripcion: string; cantidad: number | null; ubicacion_actual: string | null };
export type NecesidadCtx = {
  hospital_id: string; hospital: string; ubicacion: string | null;
  criticos: number; personas: number;
  insumos: { insumo_id: string; nombre: string; cantidad: number | null; area: string | null; prioridad: string | null }[];
};
export type Sugerencia = { hospital_id: string; insumo_id: string | null; cantidad_sugerida: number | null; razon: string };

const PROMPT = `Eres el coordinador logístico de una plataforma de emergencias médicas en Venezuela.
Llega una OFERTA (donación de insumos físicos, o disponibilidad de personal humano). Sugiere cómo repartirla
entre los hospitales según su necesidad real. NO inventes hospitales ni insumos: usa SOLO los ids que te doy.
Prioriza por: criticidad (insumos prioridad critica/alta), número de pacientes/críticos del hospital, y
compatibilidad (que el insumo ofrecido cubra una necesidad parecida). Reparte la cantidad de la oferta entre
uno o varios hospitales si tiene sentido (ej. 30 al más crítico, 20 al siguiente). Para "personal_humano"
sugiere el/los hospitales con mayor criticidad (insumo_id=null, cantidad_sugerida=1).

Responde SOLO JSON: {"sugerencias":[{"hospital_id":string,"insumo_id":string|null,"cantidad_sugerida":number|null,"razon":string}]}
"razon" = 1 frase clara para un humano (ej. "Alta criticidad: 12 críticos y solicita férulas").`;

export async function sugerirAsignacion(oferta: OfertaCtx, necesidades: NecesidadCtx[]): Promise<Sugerencia[]> {
  if (!necesidades.length) return [];
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: JSON.stringify({ oferta, hospitales: necesidades }) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}"); } catch { return []; }
  // Solo ids reales: la IA no puede inyectar hospitales/insumos inexistentes.
  const validHosp = new Set(necesidades.map((n) => n.hospital_id));
  const validIns = new Set(necesidades.flatMap((n) => n.insumos.map((i) => i.insumo_id)));
  return (Array.isArray(parsed.sugerencias) ? parsed.sugerencias : [])
    .filter((s: any) => s && validHosp.has(s.hospital_id))
    .map((s: any) => ({
      hospital_id: s.hospital_id,
      insumo_id: s.insumo_id && validIns.has(s.insumo_id) ? s.insumo_id : null,
      cantidad_sugerida: typeof s.cantidad_sugerida === "number" ? s.cantidad_sugerida : null,
      razon: String(s.razon ?? "").slice(0, 300),
    }))
    .slice(0, 10);
}
