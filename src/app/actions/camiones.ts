"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// LANE T — LOGÍSTICA DE TRANSPORTE: camiones + camioneros ligados al ciclo de entrega.
// Los camiones cargan entregas (entregas.camion_id / camionero_id, migración
// 20260723110000_camiones_calendario.sql). La capacidad se calcula sobre las entregas
// EN CURSO asignadas al camión. El acceso es de logística (admin o miembro de centro
// de acopio); un CAMIONERO (fila en `camioneros` con su user_id) solo ve/avanza sus
// entregas asignadas — el rol NO se toca (gate por presencia en la tabla).

const DENEGADO = { ok: false as const, error: "No autorizado (solo logística / centros de acopio)." };

// Estados de entrega que OCUPAN espacio en el camión (todo lo no terminal).
const ESTADOS_EN_CURSO = ["registrada", "en_camino_acopio", "en_acopio", "en_camino_hospital"];
// Ciclo de la entrega: siguiente pierna que puede marcar el camionero.
const SIGUIENTE_ESTADO: Record<string, string> = {
  registrada: "en_camino_acopio",
  en_camino_acopio: "en_acopio",
  en_acopio: "en_camino_hospital",
  en_camino_hospital: "recibido", // entregado en mano → recibido
};

async function esLogistica(): Promise<boolean> {
  const sc = await getScope();
  return sc.admin || sc.centroIds.length > 0;
}

// ¿El usuario actual es CAMIONERO? (tiene fila activa en `camioneros` con su user_id).
// Este es el gate de acceso del chofer — NO se modifica el enum de roles.
export async function esCamionero(): Promise<boolean> {
  return !!(await miCamionero());
}

// Fila `camioneros` del usuario actual (o null si no es camionero).
export async function miCamionero(): Promise<{ id: string; nombre: string; centro_id: string | null } | null> {
  const sc = await getScope();
  if (!sc.uid) return null;
  const a = createAdminClient();
  const { data } = await a.from("camioneros").select("id, nombre, centro_id")
    .eq("user_id", sc.uid).eq("activo", true).limit(1);
  return (data?.[0] as { id: string; nombre: string; centro_id: string | null } | undefined) ?? null;
}

// Centros de acopio para los selects de camiones/camioneros/agenda (FK → centros_acopio).
export async function listarCentrosAcopio(): Promise<{ id: string; nombre: string; zona: string | null }[]> {
  const a = createAdminClient();
  const { data } = await a.from("centros_acopio").select("id, nombre, zona").eq("activo", true).order("nombre");
  return (data ?? []) as { id: string; nombre: string; zona: string | null }[];
}

// ── CAMIONES ──
const CAMPOS_CAMION = ["placa", "modelo", "capacidad", "capacidad_unidad", "centro_id", "activo", "notas"];

export type CamionConCarga = {
  id: string; placa: string | null; modelo: string | null;
  capacidad: number | null; capacidad_unidad: string | null;
  centro_id: string | null; activo: boolean; notas: string | null;
  centro?: { nombre: string | null } | null;
  usado: number; disponible: number | null; lleno: boolean;
};

// Lista camiones con su CARGA en curso (usado/disponible/lleno) en una sola pasada.
export async function listarCamiones(): Promise<CamionConCarga[]> {
  if (!(await esLogistica())) return [];
  const a = createAdminClient();
  const { data: camiones } = await a.from("camiones")
    .select("*, centro:centro_id(nombre)").order("created_at", { ascending: false });
  const ids = (camiones ?? []).map((c: any) => c.id);
  const cargas: Record<string, number> = {};
  if (ids.length) {
    const { data: ent } = await a.from("entregas").select("camion_id, cantidad")
      .in("camion_id", ids).in("estado", ESTADOS_EN_CURSO);
    for (const e of (ent ?? []) as { camion_id: string | null; cantidad: number | null }[]) {
      if (e.camion_id) cargas[e.camion_id] = (cargas[e.camion_id] ?? 0) + (Number(e.cantidad) || 0);
    }
  }
  return ((camiones ?? []) as any[]).map((c) => {
    const usado = cargas[c.id] ?? 0;
    const capacidad = c.capacidad != null ? Number(c.capacidad) : null;
    return {
      ...c, usado,
      disponible: capacidad != null ? Math.max(0, capacidad - usado) : null,
      lleno: capacidad != null && usado >= capacidad,
    } as CamionConCarga;
  });
}

// Carga actual de UN camión: usado = suma de cantidades de sus entregas en curso.
export async function cargaCamion(camionId: string): Promise<{ capacidad: number | null; usado: number; disponible: number | null; lleno: boolean }> {
  const a = createAdminClient();
  const [{ data: cam }, { data: ent }] = await Promise.all([
    a.from("camiones").select("capacidad").eq("id", camionId).maybeSingle(),
    a.from("entregas").select("cantidad").eq("camion_id", camionId).in("estado", ESTADOS_EN_CURSO),
  ]);
  const usado = ((ent ?? []) as { cantidad: number | null }[]).reduce((s, e) => s + (Number(e.cantidad) || 0), 0);
  const capacidad = cam?.capacidad != null ? Number(cam.capacidad) : null;
  return {
    capacidad, usado,
    disponible: capacidad != null ? Math.max(0, capacidad - usado) : null,
    lleno: capacidad != null && usado >= capacidad,
  };
}

export async function crearCamion(campos: Record<string, any>) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CAMION) if (k in campos) limpio[k] = campos[k];
  if (!limpio.placa?.trim() && !limpio.modelo?.trim()) return { ok: false as const, error: "Indica al menos placa o modelo." };
  const { data, error } = await a.from("camiones").insert(limpio).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("crear", "camion", data?.id, { placa: data?.placa, modelo: data?.modelo });
  return { ok: true as const, camion: data };
}

export async function actualizarCamion(id: string, campos: Record<string, any>) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CAMION) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await a.from("camiones").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "camion", id, { placa: data?.placa });
  return { ok: true as const, camion: data };
}

export async function eliminarCamion(id: string) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const { error } = await a.from("camiones").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("eliminar", "camion", id);
  return { ok: true as const };
}

// ── CAMIONEROS ──
const CAMPOS_CAMIONERO = ["user_id", "nombre", "telefono", "licencia", "centro_id", "activo"];

export async function listarCamioneros() {
  if (!(await esLogistica())) return [];
  const a = createAdminClient();
  const { data } = await a.from("camioneros")
    .select("*, centro:centro_id(nombre)").order("nombre");
  return (data ?? []) as any[];
}

export async function crearCamionero(campos: Record<string, any>) {
  if (!(await esLogistica())) return DENEGADO;
  if (!campos.nombre?.trim()) return { ok: false as const, error: "El nombre del camionero es obligatorio." };
  const a = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CAMIONERO) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await a.from("camioneros").insert(limpio).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("crear", "camionero", data?.id, { nombre: data?.nombre });
  return { ok: true as const, camionero: data };
}

export async function actualizarCamionero(id: string, campos: Record<string, any>) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const limpio: Record<string, any> = {};
  for (const k of CAMPOS_CAMIONERO) if (k in campos) limpio[k] = campos[k];
  const { data, error } = await a.from("camioneros").update(limpio).eq("id", id).select().single();
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("editar", "camionero", id, { nombre: data?.nombre });
  return { ok: true as const, camionero: data };
}

export async function eliminarCamionero(id: string) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const { error } = await a.from("camioneros").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("eliminar", "camionero", id);
  return { ok: true as const };
}

// ── ASIGNACIÓN camión/camionero ↔ entrega ──

// Entregas EN CURSO asignables (para el select de despacho). Scope: admin todo;
// centro: las dirigidas a sus centros de acopio (entregas.refugio_id).
export async function listarEntregasAsignables() {
  const sc = await getScope();
  if (!sc.uid || !(sc.admin || sc.centroIds.length > 0)) return [];
  const a = createAdminClient();
  let q = a.from("entregas")
    .select(`id, codigo, estado, cantidad, camion_id, camionero_id,
      hospital:hospital_id(nombre), refugio:refugio_id(nombre), insumos:insumo_id(nombre), ofertas:oferta_id(descripcion)`)
    .in("estado", ESTADOS_EN_CURSO).order("created_at", { ascending: false }).limit(200);
  if (!sc.admin) q = q.in("refugio_id", sc.centroIds);
  const { data } = await q;
  return (data ?? []) as any[];
}

// Asigna camión y/o camionero a una entrega por su código. Avisa si el camión va lleno.
export async function asignarCamionAEntrega(codigo: string, opts: { camionId?: string | null; camioneroId?: string | null }) {
  if (!(await esLogistica())) return DENEGADO;
  const a = createAdminClient();
  const { data: e } = await a.from("entregas").select("id, estado, camion_id, camionero_id").eq("codigo", codigo).maybeSingle();
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (!ESTADOS_EN_CURSO.includes(e.estado)) return { ok: false as const, error: "Esta entrega ya está cerrada." };

  const upd: Record<string, unknown> = {};
  if ("camionId" in opts) upd.camion_id = opts.camionId ?? null;
  if ("camioneroId" in opts) upd.camionero_id = opts.camioneroId ?? null;
  if (!Object.keys(upd).length) return { ok: false as const, error: "Nada que asignar." };

  // Indicador de capacidad: avisa (no bloquea) si el camión ya está lleno.
  let aviso: string | null = null;
  if (opts.camionId) {
    const carga = await cargaCamion(opts.camionId);
    if (carga.lleno) aviso = "⚠️ Ese camión ya está LLENO según su capacidad; revisa la carga antes de despachar.";
  }
  const { error } = await a.from("entregas").update(upd).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };
  await registrarLog("asignar", "entrega", e.id, { codigo, camion_id: opts.camionId ?? null, camionero_id: opts.camioneroId ?? null });
  return { ok: true as const, aviso };
}

// ── VISTA DEL CAMIONERO ──

// Entregas asignadas al camionero actual (su hoja de ruta). Incluye las recién recibidas.
export async function misEntregasCamionero() {
  const cam = await miCamionero();
  if (!cam) return [];
  const a = createAdminClient();
  const { data } = await a.from("entregas")
    .select(`id, codigo, estado, cantidad, area, created_at, recibido_at, evidencia,
      hospital:hospital_id(nombre, ubicacion), refugio:refugio_id(nombre, ubicacion),
      insumos:insumo_id(nombre), ofertas:oferta_id(descripcion, tipo), camion:camion_id(placa, modelo)`)
    .eq("camionero_id", cam.id)
    .in("estado", [...ESTADOS_EN_CURSO, "recibido"])
    .order("created_at", { ascending: false }).limit(100);
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    siguiente: SIGUIENTE_ESTADO[r.estado] ?? null,
  }));
}

// El CAMIONERO avanza SU entrega a la siguiente pierna del ciclo
// (…→ en_camino_hospital → recibido) con foto de evidencia opcional.
// FormData: codigo (requerido), foto (File opcional), nota (opcional).
export async function avanzarEntregaCamionero(formData: FormData) {
  const codigo = String(formData.get("codigo") ?? "").trim();
  const nota = (formData.get("nota") as string | null)?.trim() || null;
  if (!codigo) return { ok: false as const, error: "Falta el código de la entrega." };

  const cam = await miCamionero();
  const sc = await getScope();
  if (!cam && !sc.admin) return { ok: false as const, error: "Solo el camionero asignado puede avanzar esta entrega." };

  const a = createAdminClient();
  const { data: e } = await a.from("entregas")
    .select("id, estado, camionero_id, donacion_id, oferta_id, entrega_user, hospital_id, evidencia, foto_path")
    .eq("codigo", codigo).maybeSingle();
  if (!e) return { ok: false as const, error: "Entrega no encontrada." };
  if (!sc.admin && (!cam || e.camionero_id !== cam.id)) return { ok: false as const, error: "Esta entrega no está asignada a ti." };

  const siguiente = SIGUIENTE_ESTADO[e.estado];
  if (!siguiente) return { ok: false as const, error: "Esta entrega ya está cerrada." };

  // Evidencia (foto) del camionero: se sube al bucket `fotos` y se guarda en el jsonb
  // `evidencia` sin pisar lo existente (predespacho / entrega en mano según la pierna).
  let fotoPath: string | null = null;
  const foto = formData.get("foto");
  if (foto instanceof File && foto.size) {
    const buf = Buffer.from(await foto.arrayBuffer());
    const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    const path = `entregas/camionero-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await a.storage.from("fotos").upload(path, buf, { contentType: foto.type || "application/octet-stream", upsert: false });
    if (!upErr) fotoPath = path;
  }

  const upd: Record<string, unknown> = { estado: siguiente };
  const evidencia: Record<string, unknown> = { ...((e.evidencia as object) ?? {}) };
  if (fotoPath) {
    // 'recibido' = foto de la entrega en mano; antes = foto de pre-despacho / carga.
    evidencia[siguiente === "recibido" ? "entrega_foto_path" : "imagen_predespacho"] = fotoPath;
  }
  if (nota) evidencia[`nota_${siguiente}`] = nota;
  if (fotoPath || nota) upd.evidencia = evidencia;

  if (siguiente === "recibido") {
    upd.recibido_at = new Date().toISOString();
    upd.recibido_por_nombre = cam ? `${cam.nombre} (camionero)` : "Camionero";
    if (fotoPath && !e.foto_path) upd.foto_path = fotoPath; // trazabilidad: foto principal si no había
  }

  const { error } = await a.from("entregas").update(upd).eq("id", e.id);
  if (error) return { ok: false as const, error: error.message };

  // Sincroniza la conciliación (misma lógica que el ciclo de entregas existente).
  if (e.donacion_id) {
    const estadoDon = siguiente === "recibido" ? "recibido" : "en_camino";
    await a.from("donaciones").update({ estado: estadoDon }).eq("id", e.donacion_id);
  }
  if (siguiente === "recibido" && e.oferta_id) {
    await a.from("ofertas").update({ estatus: "entregado" }).eq("id", e.oferta_id);
  }
  // Avisa al donante cuando su donación fue entregada en mano.
  if (siguiente === "recibido" && e.entrega_user) {
    await a.from("notificaciones").insert({
      usuario_destino_id: e.entrega_user,
      mensaje: `✅ Tu donación fue entregada por el camionero. Mira el detalle: /donaciones/${codigo}`,
    }).then(() => 0, () => 0);
  }
  await registrarLog("editar", "entrega", e.id, { codigo, estado: siguiente, por: "camionero" });
  return { ok: true as const, estado: siguiente };
}
