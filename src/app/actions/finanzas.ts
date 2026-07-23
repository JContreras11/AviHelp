"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// LANE C — Dinero: cuentas bancarias (VES/USD) + movimientos (ingreso/egreso).
// Área RESTRINGIDA (admin/logística): service_role salta RLS, así que CADA mutación
// verifica alcance. Gestiona quien es admin o miembro de al menos un centro.
const DENEGADO = { ok: false as const, error: "No tienes permiso sobre finanzas." };

async function puedeGestionar() {
  const sc = await getScope();
  return sc.admin || sc.centroIds.length > 0;
}

// ── Cuentas ──
const CAMPOS_CUENTA = ["nombre", "banco", "moneda", "numero", "titular", "saldo_inicial", "activo"];

export async function listarCuentas() {
  const s = createAdminClient();
  const { data } = await s.from("cuentas").select("*").order("activo", { ascending: false }).order("nombre");
  return data ?? [];
}

export async function crearCuenta(campos: Record<string, any>) {
  if (!(await puedeGestionar())) return DENEGADO;
  if (!campos.nombre?.trim()) return { ok: false, error: "El nombre de la cuenta es obligatorio." };
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CUENTA) if (k in campos) limpio[k] = campos[k];
  if (limpio.moneda && !["USD", "VES"].includes(limpio.moneda)) return { ok: false, error: "Moneda inválida." };
  if ("saldo_inicial" in limpio) limpio.saldo_inicial = Number(limpio.saldo_inicial) || 0;
  const { data, error } = await s.from("cuentas").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "cuenta", data?.id, { nombre: data?.nombre });
  return { ok: true, cuenta: data };
}

export async function actualizarCuenta(id: string, campos: Record<string, any>) {
  if (!(await puedeGestionar())) return DENEGADO;
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CUENTA) if (k in campos) limpio[k] = campos[k];
  if (limpio.moneda && !["USD", "VES"].includes(limpio.moneda)) return { ok: false, error: "Moneda inválida." };
  if ("saldo_inicial" in limpio) limpio.saldo_inicial = Number(limpio.saldo_inicial) || 0;
  const { data, error } = await s.from("cuentas").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "cuenta", id, { nombre: data?.nombre });
  return { ok: true, cuenta: data };
}

export async function eliminarCuenta(id: string) {
  if (!(await puedeGestionar())) return DENEGADO;
  const s = createAdminClient();
  // Los movimientos quedan con cuenta_id nula (ON DELETE SET NULL); no se pierde el historial.
  const { error } = await s.from("cuentas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "cuenta", id);
  return { ok: true };
}

// ── Movimientos (gastos: ingreso/egreso) ──
const CAMPOS_GASTO = ["cuenta_id", "tipo", "concepto", "monto", "moneda", "categoria_id", "referencia", "fecha"];

export async function listarGastos(filtros?: { cuentaId?: string; tipo?: string; desde?: string; hasta?: string }) {
  const s = createAdminClient();
  let q = s.from("gastos").select("*, cuentas(nombre, banco), categorias(nombre)").order("fecha", { ascending: false }).order("created_at", { ascending: false });
  if (filtros?.cuentaId) q = q.eq("cuenta_id", filtros.cuentaId);
  if (filtros?.tipo) q = q.eq("tipo", filtros.tipo);
  if (filtros?.desde) q = q.gte("fecha", filtros.desde);
  if (filtros?.hasta) q = q.lte("fecha", filtros.hasta);
  const { data } = await q;
  return data ?? [];
}

export async function crearGasto(campos: Record<string, any>) {
  if (!(await puedeGestionar())) return DENEGADO;
  if (!campos.concepto?.trim()) return { ok: false, error: "El concepto es obligatorio." };
  if (!["ingreso", "egreso"].includes(campos.tipo)) return { ok: false, error: "Tipo inválido (ingreso/egreso)." };
  const monto = Number(campos.monto);
  if (!(monto > 0)) return { ok: false, error: "El monto debe ser mayor a 0." };
  const s = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_GASTO) if (k in campos && campos[k] !== "" && campos[k] != null) limpio[k] = campos[k];
  limpio.monto = monto;
  if (limpio.moneda && !["USD", "VES"].includes(limpio.moneda)) return { ok: false, error: "Moneda inválida." };
  const { data, error } = await s.from("gastos").insert(limpio).select().single();
  if (error) return { ok: false, error: error.message };
  await registrarLog("crear", "gasto", data?.id, { tipo: data?.tipo, concepto: data?.concepto, monto: data?.monto });
  return { ok: true, gasto: data };
}

export async function eliminarGasto(id: string) {
  if (!(await puedeGestionar())) return DENEGADO;
  const s = createAdminClient();
  const { error } = await s.from("gastos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "gasto", id);
  return { ok: true };
}

// Saldo de una cuenta = saldo_inicial + Σ ingresos − Σ egresos (de sus movimientos).
export async function resumenCuenta(cuentaId: string) {
  const s = createAdminClient();
  const [{ data: cuenta }, { data: movs }] = await Promise.all([
    s.from("cuentas").select("*").eq("id", cuentaId).single(),
    s.from("gastos").select("tipo, monto").eq("cuenta_id", cuentaId),
  ]);
  const inicial = Number(cuenta?.saldo_inicial) || 0;
  let ingresos = 0, egresos = 0;
  for (const m of movs ?? []) {
    const n = Number(m.monto) || 0;
    if (m.tipo === "ingreso") ingresos += n; else if (m.tipo === "egreso") egresos += n;
  }
  return { cuenta, ingresos, egresos, saldo: inicial + ingresos - egresos, movimientos: (movs ?? []).length };
}

// Categorías (creadas por LANE A). Se consultan por nombre para clasificar movimientos.
export async function listarCategorias() {
  const s = createAdminClient();
  const { data } = await s.from("categorias").select("id, nombre").order("nombre");
  return data ?? [];
}
