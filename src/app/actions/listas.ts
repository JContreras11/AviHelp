"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { getAnalytics } from "@/app/actions/analytics";

// Consultas paginadas en el SERVIDOR: el cliente nunca carga cientos de filas
// (eso colgaba teléfonos lentos). Cada página trae ~25 filas + total.

export type Pagina = { rows: any[]; total: number };
export type Orden = { col: string; dir: "asc" | "desc" };
export type Args = { page?: number; pageSize?: number; q?: string; filtros?: Record<string, string>; orden?: Orden | null };

function rango(page = 0, pageSize = 25) {
  return [page * pageSize, page * pageSize + pageSize - 1] as const;
}
const like = (s: string) => s.replace(/[%,()]/g, " ").trim();
// Orden seguro: solo columnas en la whitelist (evita inyección).
function aplicarOrden(query: any, orden: Orden | null | undefined, permitidas: string[], def: Orden) {
  const o = orden && permitidas.includes(orden.col) ? orden : def;
  return query.order(o.col, { ascending: o.dir === "asc" });
}

export async function listarPersonas({ page = 0, pageSize = 25, q = "", filtros = {}, orden = null }: Args = {}): Promise<Pagina> {
  const s = createAdminClient();
  // Pacientes son data privada: admin ve todo; el resto solo los de sus hospitales.
  const sc = await getScope();
  if (!sc.admin) {
    if (sc.hospitalIds.length === 0) return { rows: [], total: 0 };
  }
  let query = s.from("personas")
    .select("id,nombre,cedula,edad,sexo,estado_salud,ubicacion,telefono_contacto,hospital_id,created_at,updated_at,hospitales(nombre)", { count: "exact" });
  if (!sc.admin) query = query.in("hospital_id", sc.hospitalIds);
  if (q.trim()) query = query.or(`nombre.ilike.%${like(q)}%,cedula.ilike.%${like(q)}%,ubicacion.ilike.%${like(q)}%`);
  if (filtros.estado_salud) query = query.eq("estado_salud", filtros.estado_salud);
  if (filtros.sexo) query = query.eq("sexo", filtros.sexo);
  if (filtros.hospital_id) query = query.eq("hospital_id", filtros.hospital_id);
  query = aplicarOrden(query, orden,
    ["nombre", "cedula", "edad", "sexo", "estado_salud", "ubicacion", "telefono_contacto", "created_at"],
    { col: "updated_at", dir: "desc" });
  const [from, to] = rango(page, pageSize);
  const { data, count } = await query.range(from, to);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listarInsumos({ page = 0, pageSize = 25, q = "", filtros = {}, orden = null }: Args = {}): Promise<Pagina> {
  const s = createAdminClient();
  let query = s.from("insumos")
    .select("id,nombre,cantidad,unidad,presentacion,area,prioridad,estado,created_at,hospitales(nombre)", { count: "exact" });
  if (q.trim()) query = query.or(`nombre.ilike.%${like(q)}%,area.ilike.%${like(q)}%`);
  if (filtros.estado) query = query.eq("estado", filtros.estado);
  if (filtros.prioridad) query = query.eq("prioridad", filtros.prioridad);
  if (filtros.area) query = query.eq("area", filtros.area);
  query = aplicarOrden(query, orden,
    ["nombre", "cantidad", "presentacion", "area", "prioridad", "estado", "created_at"],
    { col: "created_at", dir: "desc" });
  const [from, to] = rango(page, pageSize);
  const { data, count } = await query.range(from, to);
  return { rows: data ?? [], total: count ?? 0 };
}

// Personas reportadas como DESAPARECIDAS: vista pública (la comunidad ayuda a ubicarlas).
// A diferencia de los pacientes (privados), aquí se muestran foto y datos para difundir.
export async function listarDesaparecidos() {
  const s = createAdminClient();
  const { data } = await s.from("personas")
    .select("id,nombre,edad,sexo,ubicacion,descripcion_fisica,telefono_contacto,contacto_nombre,fotos,created_at")
    .eq("estado_salud", "desaparecido")
    .order("created_at", { ascending: false })
    .limit(500);
  return data ?? [];
}

// Listas chicas: se traen completas (pocas filas).
export async function listarCentros() {
  const s = createAdminClient();
  const { data } = await s.from("centros_acopio").select("*").order("nombre");
  return data ?? [];
}

export async function listarHospitales() {
  return (await getAnalytics()).hospitales;
}

// Áreas/servicios distintos para el filtro de insumos (consulta liviana).
export async function areasInsumo(): Promise<string[]> {
  const s = createAdminClient();
  const { data } = await s.from("insumos").select("area").not("area", "is", null).limit(1000);
  const areas = (data ?? []).map((r: any) => r.area).filter(Boolean) as string[];
  return [...new Set(areas)].sort();
}

export async function contarTodo() {
  const s = createAdminClient();
  const head = (t: string) => s.from(t).select("*", { count: "exact", head: true });
  const [p, i, h, c] = await Promise.all([head("personas"), head("insumos"), head("hospitales"), head("centros_acopio")]);
  return { personas: p.count ?? 0, insumos: i.count ?? 0, hospitales: h.count ?? 0, acopio: c.count ?? 0 };
}
