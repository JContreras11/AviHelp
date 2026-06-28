"use server";

import { createAdminClient } from "@/lib/supabase/server";

export type Analytics = {
  personasTotal: number;
  insumosTotal: number;
  hospitalesTotal: number;
  donacionesTotal: number;
  personasPorEstado: { estado: string; n: number }[];
  insumosPorEstado: { estado: string; n: number }[];
  insumosPorPrioridad: { prioridad: string; n: number }[];
  zonas: { zona: string; n: number; criticos: number }[];
  completitud: { campo: string; pct: number }[];
  hospitales: {
    id: string; nombre: string; ubicacion: string | null;
    personas: number; insumos: number; criticos: number; entregados: number; completitud: number;
  }[];
};

function cuenta<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || "—"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

export async function getAnalytics(): Promise<Analytics> {
  const s = createAdminClient();
  const [{ data: personas }, { data: insumos }, { data: hospitales }, { count: donaciones }] = await Promise.all([
    s.from("personas").select("estado_salud,cedula,telefono_contacto,ubicacion,edad,hospital_id"),
    s.from("insumos").select("estado,prioridad,hospital_id"),
    s.from("hospitales").select("id,nombre,ubicacion,tipo"),
    s.from("donaciones_monetarias").select("*", { count: "exact", head: true }),
  ]);

  const P: any[] = personas ?? [], I: any[] = insumos ?? [], H: any[] = hospitales ?? [];
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  const completitud = [
    { campo: "Cédula", pct: pct(P.filter((p) => p.cedula).length, P.length) },
    { campo: "Teléfono", pct: pct(P.filter((p) => p.telefono_contacto).length, P.length) },
    { campo: "Procedencia", pct: pct(P.filter((p) => p.ubicacion).length, P.length) },
    { campo: "Edad", pct: pct(P.filter((p) => p.edad).length, P.length) },
  ];

  const hospitales2 = H.map((h) => {
    const hp = P.filter((p) => p.hospital_id === h.id);
    const hi = I.filter((i) => i.hospital_id === h.id);
    return {
      id: h.id, nombre: h.nombre, ubicacion: h.ubicacion, tipo: h.tipo,
      personas: hp.length,
      insumos: hi.length,
      criticos: hi.filter((i) => i.prioridad === "critica" || i.prioridad === "alta").length,
      entregados: hi.filter((i) => i.estado === "entregado").length,
      completitud: pct(hi.filter((i) => i.estado === "entregado").length, hi.length),
    };
  }).sort((a, b) => b.criticos - a.criticos || b.insumos - a.insumos);

  // Zonas más afectadas (top 10 por nº de personas; críticos = heridos/desaparecidos/fallecidos)
  const zonaMap = new Map<string, { n: number; criticos: number }>();
  for (const p of P) {
    const z = p.ubicacion || "Sin ubicación";
    const cur = zonaMap.get(z) ?? { n: 0, criticos: 0 };
    cur.n++;
    if (["herido", "desaparecido", "fallecido"].includes(p.estado_salud)) cur.criticos++;
    zonaMap.set(z, cur);
  }
  const zonas = [...zonaMap.entries()]
    .map(([zona, v]) => ({ zona, n: v.n, criticos: v.criticos }))
    .sort((a, b) => b.n - a.n).slice(0, 10);

  return {
    personasTotal: P.length,
    insumosTotal: I.length,
    hospitalesTotal: H.length,
    donacionesTotal: donaciones ?? 0,
    personasPorEstado: cuenta(P, (p) => p.estado_salud).map((x) => ({ estado: x.k, n: x.n })),
    insumosPorEstado: cuenta(I, (i) => i.estado).map((x) => ({ estado: x.k, n: x.n })),
    insumosPorPrioridad: cuenta(I, (i) => i.prioridad).map((x) => ({ prioridad: x.k, n: x.n })),
    zonas,
    completitud,
    hospitales: hospitales2,
  };
}
