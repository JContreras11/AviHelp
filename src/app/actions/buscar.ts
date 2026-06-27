"use server";

import { createAdminClient } from "@/lib/supabase/server";

// Búsqueda dinámica sobre personas e insumos (nombre, cédula, ubicación, hospital).
export async function buscarRegistros(q: string) {
  const s = createAdminClient();
  const term = q.trim();

  if (!term) {
    const [{ data: personas }, { data: insumos }] = await Promise.all([
      s.from("personas").select("*").order("updated_at", { ascending: false }).limit(12),
      s.from("insumos").select("*, hospitales(nombre)").order("created_at", { ascending: false }).limit(12),
    ]);
    return { personas: personas ?? [], insumos: insumos ?? [] };
  }

  const like = `%${term}%`;
  const [{ data: personas }, { data: insumos }] = await Promise.all([
    s.from("personas").select("*").or(`nombre.ilike.${like},cedula.ilike.${like},ubicacion.ilike.${like}`).limit(30),
    s.from("insumos").select("*, hospitales(nombre)").ilike("nombre", like).limit(30),
  ]);
  return { personas: personas ?? [], insumos: insumos ?? [] };
}
