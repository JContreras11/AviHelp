"use server";

// LANE B — Inventario de stock físico. STOCK real en bodega/centro de acopio.
// NO confundir con `insumos` (esa es NECESIDAD/demanda del hospital). Aquí vive lo que
// físicamente existe y se puede entregar. Acceso: admin (global) o logística (sus centros).
import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";
import { ESTATUS_INVENTARIO, type EstatusInventario } from "@/lib/inventario";

const DENEGADO = { ok: false as const, error: "No tienes permiso sobre este inventario." };

// service_role salta RLS -> cada mutación verifica el alcance. Un item sin centro
// solo lo gestiona admin; con centro, admin o miembro logística de ese centro.
async function gestiona(centroId: string | null | undefined) {
  const sc = await getScope();
  if (sc.admin) return true;
  return !!centroId && sc.centroIds.includes(centroId);
}

const CAMPOS = [
  "categoria_id", "centro_id", "nombre", "descripcion", "cantidad", "unidad",
  "presentacion", "por_presentacion", "cantidad_presentaciones", "estatus", "vencimiento",
];

// Normaliza el payload: solo campos permitidos + numéricos/fechas vacías -> null.
function limpiar(campos: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of CAMPOS) {
    if (!(k in campos)) continue;
    let v = campos[k];
    if (["cantidad", "por_presentacion", "cantidad_presentaciones"].includes(k)) {
      v = v === "" || v === null || v === undefined ? (k === "cantidad" ? 0 : null) : Number(v);
      if (Number.isNaN(v)) v = k === "cantidad" ? 0 : null;
    }
    if (["categoria_id", "centro_id", "descripcion", "unidad", "presentacion", "vencimiento"].includes(k)) {
      if (v === "" || v === undefined) v = null;
    }
    out[k] = v;
  }
  return out;
}

const like = (s: string) => s.replace(/[%,()]/g, " ").trim();

// Lista con filtros opcionales. Trae el nombre de la categoría (join) para la tabla.
export async function listarInventario(filtros: { categoriaId?: string; estatus?: string; q?: string } = {}) {
  const s = createAdminClient();
  let query = s.from("inventario")
    .select("*, categorias(nombre), centros_acopio(nombre)")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (filtros.categoriaId) query = query.eq("categoria_id", filtros.categoriaId);
  if (filtros.estatus) query = query.eq("estatus", filtros.estatus);
  if (filtros.q?.trim()) query = query.or(`nombre.ilike.%${like(filtros.q)}%,descripcion.ilike.%${like(filtros.q)}%`);
  const { data } = await query;
  return data ?? [];
}

// Categorías del catálogo (creado por Lane A). Se referencia por nombre; si aún no existe
// la tabla, devuelve lista vacía sin romper la página.
export async function listarCategoriasInventario() {
  const s = createAdminClient();
  const { data } = await s.from("categorias").select("id,nombre").order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

// Centros de acopio (para asignar ubicación del stock).
export async function listarCentrosInventario() {
  const s = createAdminClient();
  const { data } = await s.from("centros_acopio").select("id,nombre").order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

export async function getItem(id: string) {
  const s = createAdminClient();
  const { data } = await s.from("inventario")
    .select("*, categorias(nombre), centros_acopio(nombre)").eq("id", id).single();
  return data;
}

export async function crearItem(campos: Record<string, any>) {
  if (!campos.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  if (!(await gestiona(campos.centro_id))) return DENEGADO;
  const s = createAdminClient();
  const { data, error } = await s.from("inventario").insert(limpiar(campos)).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "inventario", data?.id, { nombre: data?.nombre });
  return { ok: true, item: data };
}

export async function actualizarItem(id: string, campos: Record<string, any>) {
  const s = createAdminClient();
  const { data: prev } = await s.from("inventario").select("centro_id").eq("id", id).single();
  // Debe poder gestionar el centro actual Y el destino (si lo cambia).
  if (!(await gestiona(prev?.centro_id))) return DENEGADO;
  if ("centro_id" in campos && !(await gestiona(campos.centro_id))) return DENEGADO;
  const { data, error } = await s.from("inventario").update(limpiar(campos)).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "inventario", id, { nombre: data?.nombre });
  return { ok: true, item: data };
}

export async function eliminarItem(id: string) {
  const s = createAdminClient();
  const { data: prev } = await s.from("inventario").select("centro_id").eq("id", id).single();
  if (!(await gestiona(prev?.centro_id))) return DENEGADO;
  const { error } = await s.from("inventario").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "inventario", id);
  return { ok: true };
}

export async function cambiarEstatus(id: string, estatus: string) {
  if (!ESTATUS_INVENTARIO.includes(estatus as EstatusInventario)) return { ok: false, error: "Estatus inválido." };
  const s = createAdminClient();
  const { data: prev } = await s.from("inventario").select("centro_id").eq("id", id).single();
  if (!(await gestiona(prev?.centro_id))) return DENEGADO;
  const { data, error } = await s.from("inventario").update({ estatus }).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("estatus", "inventario", id, { estatus });
  return { ok: true, item: data };
}
