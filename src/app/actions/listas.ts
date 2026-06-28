"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getAnalytics } from "@/app/actions/analytics";

// Consultas paginadas en el SERVIDOR: el cliente nunca carga cientos de filas
// (eso colgaba teléfonos lentos). Cada página trae ~25 filas + total.

export type Pagina = { rows: any[]; total: number };
export type Args = { page?: number; pageSize?: number; q?: string; filtros?: Record<string, string> };

function rango(page = 0, pageSize = 25) {
  return [page * pageSize, page * pageSize + pageSize - 1] as const;
}
const like = (s: string) => s.replace(/[%,()]/g, " ").trim();

export async function listarPersonas({ page = 0, pageSize = 25, q = "", filtros = {} }: Args = {}): Promise<Pagina> {
  const s = createAdminClient();
  let query = s.from("personas")
    .select("id,nombre,cedula,edad,sexo,estado_salud,ubicacion,telefono_contacto,hospital_id,created_at,updated_at,hospitales(nombre)", { count: "exact" });
  if (q.trim()) query = query.or(`nombre.ilike.%${like(q)}%,cedula.ilike.%${like(q)}%,ubicacion.ilike.%${like(q)}%`);
  if (filtros.estado_salud) query = query.eq("estado_salud", filtros.estado_salud);
  const [from, to] = rango(page, pageSize);
  const { data, count } = await query.order("updated_at", { ascending: false }).range(from, to);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listarInsumos({ page = 0, pageSize = 25, q = "", filtros = {} }: Args = {}): Promise<Pagina> {
  const s = createAdminClient();
  let query = s.from("insumos")
    .select("id,nombre,cantidad,unidad,presentacion,area,prioridad,estado,created_at,hospitales(nombre)", { count: "exact" });
  if (q.trim()) query = query.or(`nombre.ilike.%${like(q)}%,area.ilike.%${like(q)}%`);
  if (filtros.estado) query = query.eq("estado", filtros.estado);
  if (filtros.prioridad) query = query.eq("prioridad", filtros.prioridad);
  if (filtros.area) query = query.eq("area", filtros.area);
  const [from, to] = rango(page, pageSize);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  return { rows: data ?? [], total: count ?? 0 };
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
