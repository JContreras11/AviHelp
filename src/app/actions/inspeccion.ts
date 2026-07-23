"use server";

// LANE E — Inspección / control de calidad (triage). Opera sobre la tabla `inventario`
// (creada por LANE B). Tras el check-in un item queda 'por_revisar'; un inspector corrige
// cantidades y presentaciones, deja su firma y fija el estatus físico final.
// NO importa inventario.ts para evitar acoplamiento: consulta `inventario` directo.
// Acceso: admin (global) o logística (solo items de sus centros).
import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

const DENEGADO = { ok: false as const, error: "No tienes permiso sobre este item." };

// Estatus físicos que un inspector puede fijar al cerrar la revisión. 'inspeccionado' NO
// existe en el CHECK de inventario: la firma queda en inspeccionado_at (marca de "revisado").
const ESTATUS_INSPECCION = ["disponible", "rechazado", "danado"] as const;
export type EstatusInspeccion = (typeof ESTATUS_INSPECCION)[number];

// service_role salta RLS -> cada mutación verifica el alcance sobre el centro del item.
// Item sin centro: solo admin. Con centro: admin o miembro logística de ese centro.
async function gestiona(centroId: string | null | undefined) {
  const sc = await getScope();
  if (sc.admin) return true;
  return !!centroId && sc.centroIds.includes(centroId);
}

// Cola de inspección: items recién ingresados pendientes de revisión (join categoría + centro).
export async function listarPorRevisar() {
  const s = createAdminClient();
  const { data } = await s.from("inventario")
    .select("*, categorias(nombre), centros_acopio(nombre)")
    .eq("estatus", "por_revisar")
    .order("created_at", { ascending: true })
    .limit(1000);
  return data ?? [];
}

// Roles que tienen al menos una persona (para el 1er paso del selector de inspector).
export async function rolesConPersonas(): Promise<string[]> {
  const s = createAdminClient();
  const { data } = await s.from("profiles").select("rol").not("rol", "is", null).limit(2000);
  const roles = (data ?? []).map((r: any) => r.rol).filter(Boolean) as string[];
  return [...new Set(roles)].sort();
}

// Personas de un rol dado (2º paso: nombre buscable). Solo con nombre o email visible.
export async function personasPorRol(rol: string) {
  if (!rol) return [];
  const s = createAdminClient();
  const { data } = await s.from("profiles")
    .select("id, nombre, email")
    .eq("rol", rol)
    .order("nombre", { ascending: true });
  return (data ?? []) as { id: string; nombre: string | null; email: string | null }[];
}

const num = (v: any): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

type InspeccionInput = {
  inspectorNombre: string;
  inspectorRol: string;
  nombre?: string;
  cantidad?: number | string;
  unidad?: string;
  presentacion?: string;
  por_presentacion?: number | string;
  cantidad_presentaciones?: number | string;
  estatus?: string;
};

// Cierra la inspección de un item: corrige cantidades/presentaciones, firma quién inspeccionó
// (nombre + rol + fecha) y fija el estatus físico final. Recalcula `cantidad` a partir de las
// presentaciones cuando vienen ambas (cantidad = nº presentaciones × unidades por presentación).
export async function inspeccionarItem(id: string, input: InspeccionInput) {
  if (!id) return { ok: false as const, error: "Falta el item." };
  if (!input?.inspectorNombre?.trim()) return { ok: false as const, error: "Indica quién inspecciona." };

  const estatus = input.estatus ?? "disponible";
  if (!ESTATUS_INSPECCION.includes(estatus as EstatusInspeccion)) {
    return { ok: false as const, error: "Estatus inválido." };
  }

  const s = createAdminClient();
  const { data: prev } = await s.from("inventario").select("centro_id").eq("id", id).maybeSingle();
  if (!prev) return { ok: false as const, error: "El item no existe." };
  if (!(await gestiona(prev.centro_id))) return DENEGADO;

  const patch: Record<string, any> = {
    estatus,
    inspeccionado_por_nombre: input.inspectorNombre.trim(),
    inspeccionado_por_rol: input.inspectorRol?.trim() || null,
    inspeccionado_at: new Date().toISOString(),
  };

  if (input.nombre !== undefined && input.nombre.trim()) patch.nombre = input.nombre.trim();
  if (input.unidad !== undefined) patch.unidad = input.unidad.trim() || null;
  if (input.presentacion !== undefined) patch.presentacion = input.presentacion.trim() || null;

  const porPres = input.por_presentacion !== undefined ? num(input.por_presentacion) : undefined;
  const cantPres = input.cantidad_presentaciones !== undefined ? num(input.cantidad_presentaciones) : undefined;
  if (porPres !== undefined) patch.por_presentacion = porPres;
  if (cantPres !== undefined) patch.cantidad_presentaciones = cantPres;

  // cantidad = nº presentaciones × unidades por presentación cuando ambas están dadas.
  if (porPres != null && cantPres != null) {
    patch.cantidad = cantPres * porPres;
  } else if (input.cantidad !== undefined) {
    const c = num(input.cantidad);
    patch.cantidad = c == null ? 0 : c;
  }

  const { data, error } = await s.from("inventario").update(patch).eq("id", id).select().maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("inspeccionar", "inventario", id, {
    estatus, por: patch.inspeccionado_por_nombre, rol: patch.inspeccionado_por_rol,
  });
  return { ok: true as const, item: data };
}
