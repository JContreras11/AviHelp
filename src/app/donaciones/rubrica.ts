// FIX 10 — RÚBRICA + NOMBRE de la donación. Identificamos las donaciones por NOMBRE
// (persona donante si lo hay, o "Anónimo"), etiquetadas por rúbrica según la categoría.
// Sin libs: heurística por palabras clave del tipo/descripción/área.

export type Rubrica = "Persona / Voluntariado" | "Medicamentos" | "Comida" | "Insumos";

const RE_MED = /medicament|medicin|f[áa]rmac|antibi[óo]t|analg[ée]s|jarabe|tableta|ampolla|vial|frasco|inyect|s[ue]ero|insulina|vacuna|gasa|jeringa|dosis/i;
const RE_COMIDA = /comida|aliment|v[íi]ver|pereceder|agua|leche|arroz|harina|enlatad|pan|az[úu]car|caf[ée]|cereal|atún|atun|pasta|granos?/i;

// Deriva la rúbrica desde el tipo de donación y un texto de contexto (descripción/área).
export function rubricaDonacion(tipo: string | null | undefined, texto?: string | null): Rubrica {
  if (tipo === "personal_humano") return "Persona / Voluntariado";
  const t = (texto ?? "").toString();
  if (RE_MED.test(t)) return "Medicamentos";
  if (RE_COMIDA.test(t)) return "Comida";
  return "Insumos";
}

const EMOJI: Record<Rubrica, string> = {
  "Persona / Voluntariado": "🩺",
  Medicamentos: "💊",
  Comida: "🍲",
  Insumos: "📦",
};
export const emojiRubrica = (r: Rubrica) => EMOJI[r];

// Nombre visible de la donación: persona donante si la hay; si no, "Anónimo".
export function nombreDonacion(nombre?: string | null): string {
  const n = (nombre ?? "").trim();
  return n || "Anónimo";
}
