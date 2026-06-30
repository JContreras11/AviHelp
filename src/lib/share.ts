// Helpers de compartir: títulos compactos para previews (OG/redes) + mensaje invitación.

export const SITE_URL = "https://avihelp.app";

// Abreviaturas de tipo de institución (máx. 3 letras + punto) para previews que truncan.
const ABREV: [RegExp, string][] = [
  [/^hospitales?\b/i, "Hosp."],
  [/^cl[ií]nicas?\b/i, "Clí."],
  [/^refugios?\b/i, "Ref."],
  [/^centros?\b/i, "Cen."],
  [/^ambulatorios?\b/i, "Amb."],
  [/^fundaci[oó]n(es)?\b/i, "Fund."],
];

// Reemplaza el tipo inicial del nombre por su abreviatura (Hospital → Hosp.).
export function abreviarInstitucion(nombre: string | null | undefined): string {
  const n = (nombre ?? "").trim();
  for (const [re, ab] of ABREV) if (re.test(n)) return n.replace(re, ab).trim();
  return n;
}

// Recorta a `max` caracteres con elipsis.
export function recortar(s: string | null | undefined, max = 26): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

// Lista corta de insumos: primeros 1-2 nombres, recortados, con "+N" si hay más.
export function listaInsumos(
  insumos: { nombre?: string | null }[] | null | undefined,
  cuantos = 2,
  max = 30,
): string {
  const todos = (insumos ?? []).map((i) => i?.nombre?.trim()).filter(Boolean) as string[];
  if (!todos.length) return "insumos médicos";
  const visibles = todos.slice(0, cuantos);
  const extra = todos.length - visibles.length;
  let s = visibles.join(", ");
  if (s.length > max) s = recortar(s, max);
  return extra > 0 ? `${s} +${extra}` : s;
}

// Título compacto para preview: "[Tipo abrev. nombre recortado] · [insumos]". Sin emoji inicial.
export function tituloCompacto(
  nombre: string | null | undefined,
  insumos?: { nombre?: string | null }[] | null,
): string {
  const centro = recortar(abreviarInstitucion(nombre), 26);
  const ins = listaInsumos(insumos, 2, 26);
  return centro ? `${centro} · ${ins}` : ins;
}

// Mensajes invitación (texto del share). La URL va aparte en navigator.share.
export function invitacionSolicitud(centro?: string | null): string {
  const c = abreviarInstitucion(centro);
  return c
    ? `Ayúdanos a cubrir esta solicitud de insumos médicos para ${c}.`
    : "Ayúdanos a cubrir esta solicitud de insumos médicos.";
}

export function invitacionDonacion(): string {
  return "Sigue el estado de esta donación de ayuda en AviHelp.";
}

export function invitacionHospital(centro?: string | null): string {
  const c = abreviarInstitucion(centro);
  return c
    ? `${c} necesita insumos médicos. Ayúdanos a difundir.`
    : "Este centro necesita insumos médicos. Ayúdanos a difundir.";
}

// Compartir un enlace llevando SIEMPRE el mensaje: navigator.share(text+url),
// y como fallback copia "mensaje + salto de línea + url" al portapapeles.
export async function compartirEnlace(opts: {
  title?: string;
  text: string;
  url: string;
}): Promise<"shared" | "copied" | "error"> {
  const { title, text, url } = opts;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch {
      // cancelado o no permitido: caemos a copiar
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "error";
  }
}
