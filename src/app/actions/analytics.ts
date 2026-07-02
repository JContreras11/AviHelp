"use server";

import { createAdminClient } from "@/lib/supabase/server";

// Panel CENTRADO EN INSUMOS (no en conteo de personas). Responde: qué se necesita,
// con qué frecuencia, dónde se pide más, qué tan grave, y cuánto está atendido vs pendiente.

const ACTIVO = ["solicitado", "en_transito"];
const ATENDIDO = ["entregado", "cubierto"];
const GRAVE = ["alta", "critica"];

export type InsumoLite = {
  id: string; nombre: string; cantidad: number | null; unidad: string | null; presentacion: string | null;
  area: string | null; prioridad: string; estado: string; hospital_id: string;
  hospitalNombre: string; hospitalUbicacion: string | null; created_at?: string;
};
export type HospitalStat = {
  id: string; nombre: string; ubicacion: string | null; tipo: string | null;
  gps_lat: number | null; gps_lng: number | null;
  insumos: number; activos: number; criticos: number; enTransito: number; atendidos: number;
  personas: number;
};
export type Demanda = { nombre: string; veces: number; cantidad: number; criticos: number };

export type Analytics = {
  personasTotal: number;
  insumosTotal: number;
  activosTotal: number;
  criticosTotal: number;
  enTransitoTotal: number;
  atendidosTotal: number;
  hospitalesTotal: number;
  donacionesTotal: number;
  insumosPorEstado: { estado: string; n: number }[];
  insumosPorPrioridad: { prioridad: string; n: number }[];
  demanda: Demanda[];
  zonas: { zona: string; n: number; criticos: number }[];
  completitud: { campo: string; pct: number }[];
  hospitales: HospitalStat[];
  insumosActivos: InsumoLite[];
  personasPorEstado: { estado: string; n: number }[];
};

function cuenta<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || "—"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

// Normaliza el nombre del insumo para agrupar la demanda ("Agua potable" ≈ "agua  Potable").
const normNombre = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

export async function getAnalytics(): Promise<Analytics> {
  const s = createAdminClient();
  // (Los renombres de siglas viven en la migración 20260702030000; no re-escribir en cada carga.)

  const [{ data: personas }, { data: insumos }, { data: hospitales }, { count: donaciones }] = await Promise.all([
    s.from("personas").select("estado_salud,cedula,telefono_contacto,ubicacion,edad,hospital_id"),
    s.from("insumos").select("id,nombre,cantidad,unidad,presentacion,area,prioridad,estado,hospital_id,created_at"),
    s.from("hospitales").select("id,nombre,ubicacion,tipo,gps_lat,gps_lng"),
    s.from("donaciones").select("*", { count: "exact", head: true }),
  ]);

  const P: any[] = personas ?? [], I: any[] = insumos ?? [], H: any[] = hospitales ?? [];
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const hById = new Map(H.map((h) => [h.id, h]));

  const esActivo = (i: any) => ACTIVO.includes(i.estado);
  const esGrave = (i: any) => GRAVE.includes(i.prioridad);
  const activos = I.filter(esActivo);

  const completitud = [
    { campo: "Cédula", pct: pct(P.filter((p) => p.cedula).length, P.length) },
    { campo: "Teléfono", pct: pct(P.filter((p) => p.telefono_contacto).length, P.length) },
    { campo: "Procedencia", pct: pct(P.filter((p) => p.ubicacion).length, P.length) },
    { campo: "Edad", pct: pct(P.filter((p) => p.edad).length, P.length) },
  ];

  // Hospitales/instituciones: métricas de INSUMOS (críticos = activos graves, no personas).
  const hospitales2: HospitalStat[] = H.map((h) => {
    const hi = I.filter((i) => i.hospital_id === h.id);
    return {
      id: h.id, nombre: h.nombre, ubicacion: h.ubicacion, tipo: h.tipo,
      gps_lat: h.gps_lat ?? null, gps_lng: h.gps_lng ?? null,
      insumos: hi.length,
      activos: hi.filter(esActivo).length,
      criticos: hi.filter((i) => esActivo(i) && esGrave(i)).length,
      enTransito: hi.filter((i) => i.estado === "en_transito").length,
      atendidos: hi.filter((i) => ATENDIDO.includes(i.estado)).length,
      personas: P.filter((p) => p.hospital_id === h.id).length,
    };
  }).sort((a, b) => b.criticos - a.criticos || b.activos - a.activos);

  // Demanda: qué insumo se pide más (frecuencia + cantidad total + cuántos graves). Solo activos.
  const demMap = new Map<string, { nombre: string; veces: number; cantidad: number; criticos: number }>();
  for (const i of activos) {
    const k = normNombre(i.nombre || "—");
    const cur = demMap.get(k) ?? { nombre: i.nombre || "—", veces: 0, cantidad: 0, criticos: 0 };
    cur.veces++;
    cur.cantidad += Number(i.cantidad) || 0;
    if (esGrave(i)) cur.criticos++;
    demMap.set(k, cur);
  }
  const demanda = [...demMap.values()].sort((a, b) => b.veces - a.veces || b.criticos - a.criticos).slice(0, 12);

  // Mapa de calor de necesidades por ZONA (dónde se pide más). n = insumos activos.
  const zonaMap = new Map<string, { n: number; criticos: number }>();
  for (const i of activos) {
    const z = hById.get(i.hospital_id)?.ubicacion || "Sin zona";
    const cur = zonaMap.get(z) ?? { n: 0, criticos: 0 };
    cur.n++;
    if (esGrave(i)) cur.criticos++;
    zonaMap.set(z, cur);
  }
  const zonas = [...zonaMap.entries()].map(([zona, v]) => ({ zona, n: v.n, criticos: v.criticos }))
    .sort((a, b) => b.criticos - a.criticos || b.n - a.n).slice(0, 12);

  // Lista de insumos ACTIVOS (para el detalle por institución y la vista mobile-first).
  const insumosActivos: InsumoLite[] = activos.map((i) => {
    const h = hById.get(i.hospital_id);
    return {
      id: i.id, nombre: i.nombre, cantidad: i.cantidad ?? null, unidad: i.unidad ?? null,
      presentacion: i.presentacion ?? null, area: i.area ?? null, prioridad: i.prioridad, estado: i.estado,
      hospital_id: i.hospital_id, hospitalNombre: h?.nombre ?? "—", hospitalUbicacion: h?.ubicacion ?? null,
      created_at: i.created_at || undefined,
    };
  }).sort((a, b) => GRAVE.indexOf(b.prioridad) - GRAVE.indexOf(a.prioridad));

  return {
    personasTotal: P.length,
    insumosTotal: I.length,
    activosTotal: activos.length,
    criticosTotal: activos.filter(esGrave).length,
    enTransitoTotal: I.filter((i) => i.estado === "en_transito").length,
    atendidosTotal: I.filter((i) => ATENDIDO.includes(i.estado)).length,
    hospitalesTotal: H.length,
    donacionesTotal: donaciones ?? 0,
    insumosPorEstado: cuenta(I, (i) => i.estado).map((x) => ({ estado: x.k, n: x.n })),
    insumosPorPrioridad: cuenta(I, (i) => i.prioridad).map((x) => ({ prioridad: x.k, n: x.n })),
    demanda,
    zonas,
    completitud,
    hospitales: hospitales2,
    insumosActivos,
    personasPorEstado: cuenta(P, (p) => p.estado_salud).map((x) => ({ estado: x.k, n: x.n })),
  };
}
