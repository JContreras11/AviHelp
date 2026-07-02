// Etiqueta de procedencia: nativo (cargado en AviHelp) = sin tag y con prioridad;
// importado de una fuente externa = tag "importado de [fuente]".
// ponytail: mapa mínimo de hosts conocidos; default = hostname. Añade hosts cuando sumes fuentes.
const CONOCIDOS: Record<string, string> = {
  "conecta-salud": "Conecta Salud",
  "conecta-salud-two.vercel.app": "Conecta Salud",
};
const EXTERNAS = new Set(["scraper", "import", "url"]);

/** Devuelve el nombre de la fuente externa, o null si es nativo (manual/ia_vision/texto/documento). */
export function fuenteImportada(
  { fuente, origen, origen_url }: { fuente?: string | null; origen?: string | null; origen_url?: string | null }
): string | null {
  if (origen && CONOCIDOS[origen]) return CONOCIDOS[origen];
  const externa = origen != null || (fuente != null && EXTERNAS.has(fuente));
  if (!externa) return null;
  if (origen_url) {
    try {
      const h = new URL(origen_url).hostname.replace(/^www\./, "");
      return CONOCIDOS[h] ?? h;
    } catch { /* url inválida → cae al genérico */ }
  }
  return origen ?? "fuente externa";
}
// Lógica verificada: manual/ia_vision → null; scraper|import|url u origen presente → nombre de la fuente.
