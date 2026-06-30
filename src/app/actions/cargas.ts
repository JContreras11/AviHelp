"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";

// "Mis Cargas": todo lo que el usuario efectivo subió (foto/voz/texto/lista),
// con las entidades extraídas de cada una (personas e insumos) para verlas/editarlas.
export type CargaConEntidades = {
  id: string;
  tipo: string | null;
  categoria: string | null;
  foto: string | null;
  contexto: string | null;
  resumen: string | null;
  hospital_id: string | null;
  hospitales: { nombre: string | null; ubicacion: string | null } | null;
  created_at: string;
  personas: any[];
  insumos: any[];
};

export async function misCargas(): Promise<CargaConEntidades[]> {
  const sc = await getScope();
  if (!sc.uid) return [];
  const s = createAdminClient();
  const { data: cargas } = await s
    .from("cargas")
    .select("id, tipo, categoria, foto, contexto, resumen, hospital_id, created_at, hospitales(nombre, ubicacion)")
    .eq("user_id", sc.uid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!cargas?.length) return [];

  const ids = cargas.map((c: any) => c.id);
  const [{ data: personas }, { data: insumos }] = await Promise.all([
    s.from("personas")
      .select("id, nombre, cedula, edad, sexo, estado_salud, ubicacion, hospital_id, fotos, carga_id")
      .in("carga_id", ids),
    s.from("insumos")
      .select("id, nombre, cantidad, unidad, presentacion, area, prioridad, estado, hospital_id, carga_id, hospitales(nombre)")
      .in("carga_id", ids),
  ]);

  return cargas.map((c: any) => ({
    ...c,
    personas: (personas ?? []).filter((p: any) => p.carga_id === c.id),
    insumos: (insumos ?? []).filter((i: any) => i.carga_id === c.id),
  }));
}
