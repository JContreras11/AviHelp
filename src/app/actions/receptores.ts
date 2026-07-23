"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// LANE F — BENEFICIARIOS / RECEPTORES + despacho final.
// Un `receptor` es el destinatario FINAL de la ayuda (comunidad, refugio de personas,
// familia, institución beneficiaria). Cierra el eslabón que faltaba: además de que el
// hospital/acopio reciba, se registra a QUIÉN se despachó finalmente el insumo.
//
// ADITIVO: no toca entregas.ts. `asignarReceptorAEntrega` escribe sobre la tabla
// `entregas` ya existente (columnas nuevas receptor_id / imagen_predespacho) vía
// createAdminClient() directamente. Toda mutación verifica alcance (service_role salta RLS).

const DENEGADO = { ok: false as const, error: "No autorizado para gestionar receptores." };

// Acceso RESTRINGIDO: admin global o personal de logística (miembro de algún centro de acopio).
async function puedeGestionar(): Promise<boolean> {
  const sc = await getScope();
  return sc.admin || sc.centroIds.length > 0;
}

// Normaliza para búsqueda flexible (sin acentos, minúsculas).
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export type Receptor = {
  id: string;
  id_fiscal_prefijo: string | null;
  id_fiscal_numero: string | null;
  nombre: string | null;
  razon_social: string | null;
  whatsapp_prefijo: string | null;
  whatsapp_numero: string | null;
  ubicacion_estado: string | null;
  ubicacion_direccion: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  tamano_personas: number | null;
  prioridad: "alta" | "media" | "baja" | null;
  responsable_nombre: string | null;
  responsable_correo: string | null;
  responsable_whatsapp: string | null;
  created_at: string;
  updated_at: string;
};

// Campos editables/creables por el formulario. Whitelist (evita inyección de columnas).
const CAMPOS = [
  "id_fiscal_prefijo", "id_fiscal_numero", "nombre", "razon_social",
  "whatsapp_prefijo", "whatsapp_numero", "ubicacion_estado", "ubicacion_direccion",
  "gps_lat", "gps_lng", "tamano_personas", "prioridad",
  "responsable_nombre", "responsable_correo", "responsable_whatsapp",
] as const;

function limpiar(campos: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of CAMPOS) if (k in campos) out[k] = campos[k] === "" ? null : campos[k];
  return out;
}

// LISTA de receptores. `q` filtra por nombre/razón social/id fiscal/ubicación (server-side).
export async function listarReceptores(q?: string): Promise<Receptor[]> {
  if (!(await puedeGestionar())) return [];
  const a = createAdminClient();
  const { data } = await a.from("receptores").select("*").order("created_at", { ascending: false }).limit(500);
  let rows = (data ?? []) as Receptor[];
  const toks = norm(q ?? "").split(/\s+/).filter(Boolean);
  if (toks.length) {
    rows = rows.filter((r) => {
      const hay = norm([r.nombre, r.razon_social, r.id_fiscal_prefijo, r.id_fiscal_numero, r.ubicacion_estado, r.ubicacion_direccion].filter(Boolean).join(" "));
      return toks.every((t) => hay.includes(t));
    });
  }
  return rows;
}

export async function getReceptor(id: string): Promise<Receptor | null> {
  if (!(await puedeGestionar())) return null;
  const a = createAdminClient();
  const { data } = await a.from("receptores").select("*").eq("id", id).maybeSingle();
  return (data as Receptor | null) ?? null;
}

// Búsqueda por identificación fiscal (evita duplicar un mismo beneficiario).
export async function buscarReceptorPorFiscal(prefijo: string, numero: string): Promise<Receptor | null> {
  if (!(await puedeGestionar())) return null;
  const num = (numero ?? "").trim();
  if (!num) return null;
  const a = createAdminClient();
  const { data } = await a.from("receptores").select("*")
    .eq("id_fiscal_prefijo", prefijo).eq("id_fiscal_numero", num).maybeSingle();
  return (data as Receptor | null) ?? null;
}

export async function crearReceptor(campos: Record<string, any>) {
  if (!(await puedeGestionar())) return DENEGADO;
  const limpio = limpiar(campos);
  if (!limpio.nombre?.trim() && !limpio.razon_social?.trim()) {
    return { ok: false as const, error: "Indica el nombre o la razón social del receptor." };
  }
  // Evita duplicar por identificación fiscal.
  if (limpio.id_fiscal_prefijo && limpio.id_fiscal_numero) {
    const dup = await buscarReceptorPorFiscal(limpio.id_fiscal_prefijo, limpio.id_fiscal_numero);
    if (dup) return { ok: false as const, error: "Ya existe un receptor con esa identificación fiscal." };
  }
  const a = createAdminClient();
  const { data, error } = await a.from("receptores").insert(limpio).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("crear", "receptor", data?.id, { nombre: data?.nombre ?? data?.razon_social });
  return { ok: true as const, receptor: data as Receptor };
}

export async function actualizarReceptor(id: string, campos: Record<string, any>) {
  if (!(await puedeGestionar())) return DENEGADO;
  const limpio = limpiar(campos);
  const a = createAdminClient();
  const { data, error } = await a.from("receptores").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "receptor", id, { nombre: data?.nombre ?? data?.razon_social });
  return { ok: true as const, receptor: data as Receptor };
}

export async function eliminarReceptor(id: string) {
  if (!(await puedeGestionar())) return DENEGADO;
  const a = createAdminClient();
  const { error } = await a.from("receptores").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("eliminar", "receptor", id);
  return { ok: true as const };
}

// Asigna el RECEPTOR FINAL a una entrega existente (por su código rastreable).
// Escribe sobre `entregas.receptor_id` (columna aditiva de esta lane). No cambia el estado
// del ciclo; solo deja constancia de a quién se destinó/despachó la ayuda.
export async function asignarReceptorAEntrega(codigo: string, receptorId: string | null) {
  if (!(await puedeGestionar())) return DENEGADO;
  const cod = (codigo ?? "").trim();
  if (!cod) return { ok: false as const, error: "Indica el código de la entrega." };
  const a = createAdminClient();
  const { data: e } = await a.from("entregas").select("id, codigo").eq("codigo", cod).maybeSingle();
  if (!e) return { ok: false as const, error: "No encontramos una entrega con ese código." };
  if (receptorId) {
    const { data: r } = await a.from("receptores").select("id").eq("id", receptorId).maybeSingle();
    if (!r) return { ok: false as const, error: "El receptor ya no existe." };
  }
  const { error } = await a.from("entregas").update({ receptor_id: receptorId }).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "entrega", e.id, { codigo: cod, receptor_id: receptorId });
  return { ok: true as const };
}
