"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getAnalytics } from "@/app/actions/analytics";

// Consultas de lista para TanStack Query (cliente). Cada tab pide solo lo suyo
// y se cachea; las mutaciones invalidan su query (refresh por evento, sin recargar todo).

export async function listarPersonas() {
  const s = createAdminClient();
  const { data } = await s.from("personas")
    .select("id,nombre,cedula,edad,sexo,estado_salud,ubicacion,telefono_contacto,hospital_id,created_at,updated_at,hospitales(nombre)")
    .order("updated_at", { ascending: false }).limit(2000);
  return data ?? [];
}

export async function listarInsumos() {
  const s = createAdminClient();
  const { data } = await s.from("insumos")
    .select("id,nombre,cantidad,unidad,presentacion,area,prioridad,estado,created_at,hospitales(nombre)")
    .order("created_at", { ascending: false }).limit(2000);
  return data ?? [];
}

export async function listarCentros() {
  const s = createAdminClient();
  const { data } = await s.from("centros_acopio").select("*").order("nombre");
  return data ?? [];
}

export async function listarHospitales() {
  return (await getAnalytics()).hospitales;
}

// Conteos rápidos (head) para tarjetas del home y etiquetas de tabs.
export async function contarTodo() {
  const s = createAdminClient();
  const head = (t: string) => s.from(t).select("*", { count: "exact", head: true });
  const [p, i, h, c] = await Promise.all([head("personas"), head("insumos"), head("hospitales"), head("centros_acopio")]);
  return { personas: p.count ?? 0, insumos: i.count ?? 0, hospitales: h.count ?? 0, acopio: c.count ?? 0 };
}
