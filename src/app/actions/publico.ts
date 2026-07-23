"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { zonaDe } from "@/lib/zona";

// VISTA PÚBLICA (sin login): estado crítico de la emergencia POR ZONA — solo agregados.
// Regla de privacidad (reunión con cliente): las necesidades por hospital NO son públicas.
// Aquí se exponen ÚNICAMENTE conteos/severidad por zona. NUNCA: nombres de hospitales,
// datos de personas/pacientes, quién solicitó, ni contactos. Los detalles se gestionan con
// los centros de acopio / aliados. Espejo de "Ayuda en Camino": estado crítico por ubicación.

// Consistente con analytics.ts: activo (pendiente) = solicitado|en_transito; atendido = entregado|cubierto.
const ACTIVO = ["solicitado", "en_transito"];
const ATENDIDO = ["entregado", "cubierto"];

export type ZonaEstado = {
  zona: string;
  hospitales: number; // # de instituciones en la zona con actividad (sin nombrarlas)
  criticos: number;   // insumos activos con prioridad 'critica'
  altos: number;      // insumos activos con prioridad 'alta'
  cubiertos: number;  // insumos ya atendidos (entregado|cubierto)
};

export type ResumenGlobal = {
  zonas: number;
  hospitales: number;
  criticos: number;
  altos: number;
  cubiertos: number;
};

// Llaves PERMITIDAS en la salida pública. Si alguna otra aparece, algo filtró data sensible.
const LLAVES_PERMITIDAS = new Set(["zona", "hospitales", "criticos", "altos", "cubiertos"]);
function assertSinFiltracion(filas: Record<string, unknown>[]) {
  for (const f of filas) {
    for (const k of Object.keys(f)) {
      if (!LLAVES_PERMITIDAS.has(k)) {
        throw new Error(`publico.estadoPorZona: llave no permitida en salida pública: "${k}"`);
      }
    }
  }
}

// Agrega el estado crítico por ZONA. Deriva la zona vía src/lib/zona.ts (GPS/palabras clave),
// nunca expone la ubicación exacta ni el nombre del hospital. Solo conteos por severidad.
export async function estadoPorZona(): Promise<ZonaEstado[]> {
  const s = createAdminClient();
  // Solo las columnas mínimas: para derivar la zona (gps/ubicacion) y agrupar por hospital.
  // NO se seleccionan nombres, responsables ni contactos.
  const [{ data: hospitales }, { data: insumos }] = await Promise.all([
    s.from("hospitales").select("id,gps_lat,gps_lng,ubicacion"),
    s.from("insumos").select("hospital_id,estado,prioridad"),
  ]);

  const H: any[] = hospitales ?? [];
  const I: any[] = insumos ?? [];

  // Zona por hospital (derivada on-read, sin columna en BD).
  const zonaDeHospital = new Map<string, string>();
  for (const h of H) zonaDeHospital.set(h.id, zonaDe(h));

  type Acc = { hospitales: Set<string>; criticos: number; altos: number; cubiertos: number };
  const porZona = new Map<string, Acc>();
  const get = (z: string): Acc => {
    let a = porZona.get(z);
    if (!a) { a = { hospitales: new Set(), criticos: 0, altos: 0, cubiertos: 0 }; porZona.set(z, a); }
    return a;
  };

  for (const i of I) {
    const z = zonaDeHospital.get(i.hospital_id) ?? "Otra zona";
    const a = get(z);
    a.hospitales.add(i.hospital_id);
    if (ACTIVO.includes(i.estado)) {
      if (i.prioridad === "critica") a.criticos++;
      else if (i.prioridad === "alta") a.altos++;
    } else if (ATENDIDO.includes(i.estado)) {
      a.cubiertos++;
    }
  }

  const filas: ZonaEstado[] = [...porZona.entries()]
    .map(([zona, a]) => ({ zona, hospitales: a.hospitales.size, criticos: a.criticos, altos: a.altos, cubiertos: a.cubiertos }))
    // Zonas críticas primero (más críticos, luego más altos, luego más hospitales activos).
    .sort((x, y) => y.criticos - x.criticos || y.altos - x.altos || y.hospitales - x.hospitales);

  // Guarda de privacidad: aborta si alguna llave no permitida se coló en la salida.
  assertSinFiltracion(filas as unknown as Record<string, unknown>[]);
  return filas;
}

// Totales globales para el encabezado de la vista pública.
export async function resumenGlobal(): Promise<ResumenGlobal> {
  const zonas = await estadoPorZona();
  return {
    zonas: zonas.length,
    hospitales: zonas.reduce((n, z) => n + z.hospitales, 0),
    criticos: zonas.reduce((n, z) => n + z.criticos, 0),
    altos: zonas.reduce((n, z) => n + z.altos, 0),
    cubiertos: zonas.reduce((n, z) => n + z.cubiertos, 0),
  };
}
