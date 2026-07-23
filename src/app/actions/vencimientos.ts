"use server";

import { createAdminClient } from "@/lib/supabase/server";

// LANE H — ALERTAS DE VENCIMIENTO (add-only).
// Medicamentos/insumos perecederos a punto de caducar: hay que PRIORIZAR su envío al
// hospital antes de que venzan. Unifica dos fuentes que ya llevan la columna `vencimiento`:
//   • `ofertas`   → donaciones registradas (producto + centro/hospital destino + área).
//   • `inventario`→ existencias en bodega (nombre + cantidad + categoría). Puede no existir
//                   aún en este entorno (lo construye otra lane): se lee de forma DEFENSIVA.
// Lectura directa vía createAdminClient (no importa inventario.ts). El control de acceso
// (logística/médico) vive en la página /vencimientos.

export type Urgencia = "vencido" | "critico" | "pronto";

export type ItemVencimiento = {
  id: string;
  origen: "donacion" | "inventario";
  nombre: string;
  cantidad: number | null;
  vencimiento: string;            // ISO date (YYYY-MM-DD)
  dias: number;                   // días restantes (negativo = ya vencido)
  urgencia: Urgencia;             // vencido (<hoy) · critico (≤15d) · pronto (≤60d)
  categoria: string | null;       // área/categoría (Trauma, Neonato, medicamento…)
  ubicacion: string | null;       // hospital/centro destino o bodega
  estatus: string | null;         // estado de la oferta / existencia
};

const MS_DIA = 86_400_000;

// Clasifica la urgencia por días restantes hasta la caducidad.
function clasificar(dias: number): Urgencia {
  if (dias < 0) return "vencido";
  if (dias <= 15) return "critico";
  return "pronto";
}

// Días completos entre hoy (a medianoche) y una fecha ISO de vencimiento.
function diasRestantes(hoyMid: number, vencISO: string): number {
  const v = new Date(`${vencISO}T00:00:00`).getTime();
  return Math.round((v - hoyMid) / MS_DIA);
}

// Lista unificada de ítems que vencen dentro de `dias` (o ya vencidos), ordenada por
// caducidad ascendente (lo más urgente primero). `dias` acota la ventana (default 60).
export async function proximosAVencer(dias = 60): Promise<ItemVencimiento[]> {
  const a = createAdminClient();

  const hoy = new Date();
  const hoyMid = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const cutoff = new Date(hoyMid + dias * MS_DIA);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const items: ItemVencimiento[] = [];

  // ── Fuente 1: DONACIONES (ofertas) con caducidad. Se excluyen las ya entregadas o
  // canceladas (no accionables). El destino es el hospital de la necesidad ligada o el
  // centro/refugio de entrega elegido.
  const { data: ofertas } = await a
    .from("ofertas")
    .select(
      "id, descripcion, cantidad, area, vencimiento, estatus, " +
        "refugio:refugio_id(nombre), insumos:insumo_id(nombre, area, hospitales:hospital_id(nombre))",
    )
    .not("vencimiento", "is", null)
    .lte("vencimiento", cutoffISO)
    .not("estatus", "in", "(entregado,cancelado)")
    .order("vencimiento", { ascending: true })
    .limit(500);

  for (const o of (ofertas ?? []) as any[]) {
    const d = diasRestantes(hoyMid, o.vencimiento);
    items.push({
      id: `oferta:${o.id}`,
      origen: "donacion",
      nombre: o.insumos?.nombre ?? o.descripcion ?? "Insumo",
      cantidad: o.cantidad ?? null,
      vencimiento: o.vencimiento,
      dias: d,
      urgencia: clasificar(d),
      categoria: o.area ?? o.insumos?.area ?? null,
      ubicacion: o.insumos?.hospitales?.nombre ?? o.refugio?.nombre ?? null,
      estatus: o.estatus ?? null,
    });
  }

  // ── Fuente 2: INVENTARIO (existencias en bodega). DEFENSIVO: si la tabla aún no existe
  // en este entorno, supabase devuelve un error que ignoramos sin romper la vista.
  try {
    const { data: inv, error } = await a
      .from("inventario")
      .select("id, nombre, cantidad, vencimiento, estatus, categoria")
      .not("vencimiento", "is", null)
      .lte("vencimiento", cutoffISO)
      .order("vencimiento", { ascending: true })
      .limit(500);
    if (!error) {
      for (const it of (inv ?? []) as any[]) {
        const d = diasRestantes(hoyMid, it.vencimiento);
        items.push({
          id: `inventario:${it.id}`,
          origen: "inventario",
          nombre: it.nombre ?? "Insumo",
          cantidad: it.cantidad ?? null,
          vencimiento: it.vencimiento,
          dias: d,
          urgencia: clasificar(d),
          categoria: it.categoria ?? null,
          ubicacion: null,
          estatus: it.estatus ?? null,
        });
      }
    }
  } catch {
    // tabla inventario inexistente en este entorno: se omite esa fuente.
  }

  // Orden global por caducidad ascendente (lo más urgente arriba).
  items.sort((x, y) => x.vencimiento.localeCompare(y.vencimiento));
  return items;
}
