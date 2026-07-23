"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// LANE A — Catálogo: categorías (taxonomía de insumos) + donantes (directorio).
// service_role salta RLS, así que la verificación de scope ES la seguridad.
const DENEGADO = { ok: false as const, error: "No tienes permiso para esta acción." };

async function esAdmin() {
  return (await getScope()).admin;
}

// ── Categorías (CRUD = solo admin) ──
export async function listarCategorias() {
  const s = createAdminClient();
  const { data } = await s.from("categorias").select("*").order("orden").order("nombre");
  return data ?? [];
}

const CAMPOS_CATEGORIA = ["nombre", "descripcion", "orden", "activo"];

export async function crearCategoria(campos: Record<string, any>) {
  if (!(await esAdmin())) return DENEGADO;
  if (!campos.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CATEGORIA) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("categorias").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "categoria", data?.id, { nombre: data?.nombre });
  return { ok: true, categoria: data };
}

export async function actualizarCategoria(id: string, campos: Record<string, any>) {
  if (!(await esAdmin())) return DENEGADO;
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CATEGORIA) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await s.from("categorias").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "categoria", id, { nombre: data?.nombre });
  return { ok: true, categoria: data };
}

export async function eliminarCategoria(id: string) {
  if (!(await esAdmin())) return DENEGADO;
  const s = createAdminClient();
  const { error } = await s.from("categorias").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "categoria", id);
  return { ok: true };
}

// ── Donantes (directorio) ──
const CAMPOS_DONANTE = [
  "id_fiscal_prefijo", "id_fiscal_numero",
  "nombre", "apellido", "razon_social",
  "whatsapp_prefijo", "whatsapp_numero",
];

// Lista/busca donantes por nombre, razón social o cédula/RIF (consulta liviana).
export async function listarDonantes(q?: string) {
  const s = createAdminClient();
  let query = s.from("donantes").select("*").order("created_at", { ascending: false }).limit(200);
  const t = (q ?? "").replace(/[%,()]/g, " ").trim();
  if (t) {
    query = query.or(
      `nombre.ilike.%${t}%,apellido.ilike.%${t}%,razon_social.ilike.%${t}%,id_fiscal_numero.ilike.%${t}%`,
    );
  }
  const { data } = await query;
  return data ?? [];
}

// Autocompletar en check-in: busca un donante por su ID fiscal (prefijo+número).
// Devuelve el donante existente o null (no muta nada).
export async function buscarDonantePorFiscal(prefijo: string, numero: string) {
  const p = (prefijo ?? "").trim();
  const n = (numero ?? "").trim();
  if (!p || !n) return null;
  const s = createAdminClient();
  const { data } = await s.from("donantes")
    .select("*")
    .eq("id_fiscal_prefijo", p)
    .eq("id_fiscal_numero", n)
    .maybeSingle();
  return data ?? null;
}

export async function crearDonante(campos: Record<string, any>) {
  const sc = await getScope();
  if (!sc.uid) return DENEGADO; // cualquier usuario autenticado puede registrar un donante
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_DONANTE) if (k in campos) {
    const v = typeof campos[k] === "string" ? campos[k].trim() : campos[k];
    limpio[k] = v === "" ? null : v;
  }
  if (!limpio.nombre && !limpio.razon_social) {
    return { ok: false, error: "Indica al menos un nombre o razón social." };
  }
  // Idempotente sobre ID fiscal: si ya existe, devuelve el existente (no duplica).
  if (limpio.id_fiscal_prefijo && limpio.id_fiscal_numero) {
    const existente = await buscarDonantePorFiscal(limpio.id_fiscal_prefijo, limpio.id_fiscal_numero);
    if (existente) return { ok: true, donante: existente, existente: true };
  }
  const { data, error } = await s.from("donantes").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "donante", data?.id, { nombre: data?.nombre ?? data?.razon_social });
  return { ok: true, donante: data };
}

export async function actualizarDonante(id: string, campos: Record<string, any>) {
  const sc = await getScope();
  if (!sc.uid) return DENEGADO;
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_DONANTE) if (k in campos) {
    const v = typeof campos[k] === "string" ? campos[k].trim() : campos[k];
    limpio[k] = v === "" ? null : v;
  }
  const { data, error } = await s.from("donantes").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "donante", id, { nombre: data?.nombre ?? data?.razon_social });
  return { ok: true, donante: data };
}
