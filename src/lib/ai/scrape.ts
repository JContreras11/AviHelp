import OpenAI from "openai";

// Extractor de NECESIDADES desde texto libre o HTML (página scrapeada).
// Mismo patrón de cliente que vision.ts / match.ts (OpenRouter + Gemini).
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
});
const MODEL = process.env.OPENROUTER_TEXT_MODEL ?? process.env.OPENROUTER_VISION_MODEL_HQ ?? "google/gemini-2.5-flash";

export type ItemNecesidad = {
  nombre: string;
  cantidad: number | null;
  unidad: string | null;
  presentacion: string | null;
  area: string | null;
  prioridad: "baja" | "media" | "alta" | "critica" | null;
};
export type ExtraccionSolicitud = {
  titulo: string | null;
  descripcion: string | null;
  items: ItemNecesidad[];
};

const PRIORIDADES = new Set(["baja", "media", "alta", "critica"]);

const PROMPT = `Eres asistente logístico de una emergencia médica en Venezuela. Te paso TEXTO (a veces HTML
o el contenido de una página web) donde un hospital o refugio lista los INSUMOS médicos que NECESITA.
Extrae SOLO lo que de verdad sea una necesidad/solicitud de insumos. NO inventes cantidades ni ítems.

Responde SOLO JSON:
{"titulo": string|null, "descripcion": string|null, "items": [
  {"nombre": string, "cantidad": number|null, "unidad": string|null,
   "presentacion": string|null, "area": string|null, "prioridad": "baja"|"media"|"alta"|"critica"|null}
]}
Reglas:
- "nombre": el insumo en singular y claro (ej. "Guantes estériles", "Solución salina 0.9%").
- "cantidad": número si aparece; si no, null. "unidad": cajas/ml/unidades/ampollas… si aparece.
- "presentacion": frasco/tableta/vial/ampolla/polvo si aplica; si no, null.
- "area": servicio/departamento si se menciona (Trauma, Pediatría, UCI…); si no, null.
- "prioridad": "critica"/"alta" si el texto marca urgencia; si no se sabe, null.
- "titulo": un nombre corto para el paquete (ej. "Insumos urgentes — Hospital X"); si no hay, null.
- Si NO hay ninguna necesidad real, devuelve items: [].`;

// Extrae necesidades de un texto/HTML. Robusto: nunca lanza, devuelve items: [] si falla.
export async function extraerNecesidades(texto: string): Promise<ExtraccionSolicitud> {
  const limpio = (texto ?? "").slice(0, 24000).trim();
  if (!limpio) return { titulo: null, descripcion: null, items: [] };
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: limpio },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    const items: ItemNecesidad[] = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((it: any) => ({
        nombre: String(it?.nombre ?? "").trim().slice(0, 160),
        cantidad: typeof it?.cantidad === "number" && Number.isFinite(it.cantidad) ? it.cantidad : null,
        unidad: it?.unidad ? String(it.unidad).trim().slice(0, 40) : null,
        presentacion: it?.presentacion ? String(it.presentacion).trim().slice(0, 40) : null,
        area: it?.area ? String(it.area).trim().slice(0, 80) : null,
        prioridad: PRIORIDADES.has(it?.prioridad) ? it.prioridad : null,
      }))
      .filter((it: ItemNecesidad) => it.nombre.length > 1)
      .slice(0, 60);
    return {
      titulo: parsed?.titulo ? String(parsed.titulo).trim().slice(0, 140) : null,
      descripcion: parsed?.descripcion ? String(parsed.descripcion).trim().slice(0, 500) : null,
      items,
    };
  } catch {
    return { titulo: null, descripcion: null, items: [] };
  }
}

// Descarga una página y devuelve su texto plano (sin scripts/estilos). No depende de navegador.
// Degrada con gracia: si no se puede leer, devuelve "" (no lanza) para no tumbar el build/flujo.
export async function descargarTextoPagina(url: string): Promise<{ ok: boolean; texto: string; error?: string }> {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, texto: "", error: "URL inválida." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, texto: "", error: "Solo http/https." };
  // Anti-SSRF: no permitir hosts internos/privados (la descarga corre en el servidor).
  if (esHostInterno(u.hostname)) return { ok: false, texto: "", error: "No se permiten direcciones internas." };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "AviHelpBot/1.0 (+https://avihelp.app)", Accept: "text/html,*/*" },
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, texto: "", error: `La página respondió ${res.status}.` };
    const html = await res.text();
    const texto = htmlATexto(html);
    // Muchas apps (SPA: React/Vue/etc.) sirven un HTML casi vacío que se rellena
    // con JavaScript en el navegador. Sin ejecutar JS solo vemos el "cascarón",
    // así que no hay nada legible que extraer: avisamos en vez de mandar basura al LLM.
    if (esShellSPA(html, texto)) {
      return {
        ok: false,
        texto: "",
        error:
          "La página es una app JavaScript (SPA) y no expone texto legible sin ejecutar el navegador. " +
          "Si esta fuente tiene una API pública o export de datos, úsala en lugar del scraping de HTML.",
      };
    }
    return { ok: true, texto };
  } catch (e: any) {
    return { ok: false, texto: "", error: e?.name === "AbortError" ? "La página tardó demasiado." : "No se pudo acceder a la página." };
  }
}

// Bloquea localhost y rangos IP privados/link-local para evitar SSRF.
function esHostInterno(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "127.0.0.1" || h.startsWith("127.")) return true;
  if (h === "::1" || h.startsWith("[")) return true; // IPv6 literal (incl. ::1, link-local)
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;            // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

// ¿El HTML es un "cascarón" de SPA (React/Vue/…) sin contenido renderizado?
// Heurística: hay un contenedor de montaje típico (<div id="root">, id="app", etc.)
// o el documento carga scripts pero el texto legible resultante es mínimo.
function esShellSPA(html: string, texto: string): boolean {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  // Si ya hay una cantidad razonable de texto legible, NO es un cascarón vacío.
  if (t.length >= 200) return false;
  const h = html.toLowerCase();
  const tieneMontaje =
    /<div[^>]+id=["'](root|app|__next|__nuxt|app-root)["']/.test(h) ||
    /<div[^>]+id=["'][^"']*root["']/.test(h);
  const cargaScripts = /<script[\s>]/.test(h);
  // Cascarón: contenedor de SPA (con muy poco texto) o página con scripts y casi sin texto.
  if (tieneMontaje) return true;
  if (cargaScripts && t.length < 60) return true;
  return false;
}

// Limpieza mínima de HTML → texto. Quita script/style, colapsa etiquetas y espacios.
function htmlATexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 24000);
}
