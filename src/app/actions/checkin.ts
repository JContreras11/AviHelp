"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";
import { crearItem } from "@/app/actions/inventario";
import { analizarDocumento, analizarTexto, transcribirAudio } from "@/lib/ai/vision";

// LANE D — Check-in / Recepción de donaciones.
// Add-only: reutiliza el catálogo (LANE A: donantes/categorías) y el inventario (LANE B: crearItem).
// Un "ingreso" es el acto de recepción físico: un donante entrega cosas -> se registra 1 fila en
// `ingresos` + 1 fila en `inventario` (estatus por_revisar) por cada ítem recibido.

// Solo logística/admin puede registrar recepciones (igual criterio que el resto de mutaciones).
async function puedeLogistica() {
  const sc = await getScope();
  return { sc, ok: sc.admin || sc.centroIds.length > 0 };
}

// ── Tipos de entrada ──
export type ItemIngreso = {
  categoria_id: string | null;
  nombre: string;
  cantidad?: number | null;
  unidad?: string | null;
  presentacion?: string | null;
  descripcion?: string | null;
};

export type CrearIngresoPayload = {
  donante_id: string | null;
  centro_id?: string | null;
  categorias: string[]; // ids de categorías seleccionadas
  detalle?: string | null;
  foto_path?: string | null;
  audio_path?: string | null;
  doc_path?: string | null;
  raw_extraccion?: any;
  items: ItemIngreso[];
};

export type CrearIngresoResult =
  | { ok: true; id: string; created_at: string; items: number }
  | { ok: false; error: string };

// PASO 4 del flujo: crea UNA fila en `ingresos` + N filas en `inventario` (una por ítem).
export async function crearIngreso(payload: CrearIngresoPayload): Promise<CrearIngresoResult> {
  const { sc, ok } = await puedeLogistica();
  if (!ok || !sc.uid) return { ok: false, error: "No tienes permiso para registrar recepciones." };

  // Centro de acopio destino: el indicado (si el usuario lo gestiona) o, por defecto para
  // logística, su primer centro. `crearItem` (LANE B) exige que un no-admin pase un centro suyo.
  let centroId = payload.centro_id ?? null;
  if (!sc.admin) {
    if (centroId && !sc.centroIds.includes(centroId))
      return { ok: false, error: "No gestionas ese centro de acopio." };
    if (!centroId) centroId = sc.centroIds[0] ?? null;
  }

  const items = (payload.items ?? []).filter((it) => it?.nombre?.trim());
  if (items.length === 0) return { ok: false, error: "Agrega al menos un ítem recibido." };

  const a = createAdminClient();

  // 1) Cabecera del ingreso.
  const { data: ingreso, error: eIng } = await a
    .from("ingresos")
    .insert({
      donante_id: payload.donante_id ?? null,
      centro_id: centroId,
      categorias: Array.isArray(payload.categorias) ? payload.categorias : [],
      detalle: payload.detalle?.trim() || null,
      foto_path: payload.foto_path ?? null,
      audio_path: payload.audio_path ?? null,
      doc_path: payload.doc_path ?? null,
      raw_extraccion: payload.raw_extraccion ?? null,
      created_by: sc.uid,
    })
    .select("id, created_at")
    .single();
  if (eIng || !ingreso) return { ok: false, error: eIng?.message ?? "No se pudo crear el ingreso." };

  // 2) Un ítem de inventario por cada cosa recibida (estatus por_revisar). Reusa crearItem
  //    (LANE B) para heredar su validación/scope/log; luego liga ingreso_id + donante_id
  //    (crearItem descarta esas claves desconocidas, así que se setean con un update propio).
  let creados = 0;
  for (const it of items) {
    const r = await crearItem({
      categoria_id: it.categoria_id ?? null,
      centro_id: centroId,
      nombre: it.nombre.trim(),
      descripcion: it.descripcion?.trim() || null,
      cantidad: it.cantidad ?? 0,
      unidad: it.unidad?.trim() || null,
      presentacion: it.presentacion?.trim() || null,
      estatus: "por_revisar",
    });
    if (r.ok && (r as any).item?.id) {
      creados++;
      await a
        .from("inventario")
        .update({ ingreso_id: ingreso.id, donante_id: payload.donante_id ?? null })
        .eq("id", (r as any).item.id);
    }
  }

  await registrarLog("recepcion", "ingreso", ingreso.id, {
    items: creados,
    donante_id: payload.donante_id ?? null,
    centro_id: centroId,
  });

  return { ok: true, id: ingreso.id, created_at: ingreso.created_at, items: creados };
}

// ── PASO 6: Auditoría ──
export type IngresoFila = {
  id: string;
  created_at: string;
  detalle: string | null;
  categorias: string[];
  donante_id: string | null;
  donante_nombre: string | null;
  items: number;
};

export type ListarIngresosFiltros = { desde?: string; hasta?: string; id?: string };

// Lista de recepciones para el panel de auditoría. Admin ve todas; logística ve las suyas
// (created_by), coherente con el índice idx_ingresos_creador.
export async function listarIngresos(filtros: ListarIngresosFiltros = {}): Promise<IngresoFila[]> {
  const { sc, ok } = await puedeLogistica();
  if (!ok || !sc.uid) return [];
  const a = createAdminClient();

  let q = a
    .from("ingresos")
    .select("id, created_at, detalle, categorias, donante_id")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!sc.admin) q = q.eq("created_by", sc.uid);
  if (filtros.id?.trim()) q = q.eq("id", filtros.id.trim());
  if (filtros.desde) q = q.gte("created_at", filtros.desde);
  if (filtros.hasta) q = q.lte("created_at", filtros.hasta);

  const { data } = await q;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  // Enriquecer con nombre de donante y conteo de ítems (consultas agrupadas, no N+1).
  const donIds = [...new Set(rows.map((r) => r.donante_id).filter(Boolean))];
  const ingIds = rows.map((r) => r.id);
  const [{ data: dons }, { data: invs }] = await Promise.all([
    donIds.length
      ? a.from("donantes").select("id, nombre, apellido, razon_social").in("id", donIds)
      : Promise.resolve({ data: [] as any[] }),
    a.from("inventario").select("ingreso_id").in("ingreso_id", ingIds),
  ]);
  const nombreDon = new Map<string, string | null>();
  for (const d of (dons ?? []) as any[]) nombreDon.set(d.id, nombreDonante(d));
  const conteo = new Map<string, number>();
  for (const v of (invs ?? []) as any[])
    conteo.set(v.ingreso_id, (conteo.get(v.ingreso_id) ?? 0) + 1);

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    detalle: r.detalle ?? null,
    categorias: r.categorias ?? [],
    donante_id: r.donante_id ?? null,
    donante_nombre: r.donante_id ? nombreDon.get(r.donante_id) ?? null : null,
    items: conteo.get(r.id) ?? 0,
  }));
}

function nombreDonante(d: any): string | null {
  if (!d) return null;
  if (d.razon_social) return d.razon_social;
  const n = [d.nombre, d.apellido].filter(Boolean).join(" ").trim();
  return n || null;
}

export type IngresoDetalle = {
  ingreso: {
    id: string;
    created_at: string;
    detalle: string | null;
    categorias: string[];
    centro_id: string | null;
    foto_path: string | null;
    audio_path: string | null;
    doc_path: string | null;
    donante_id: string | null;
    donante_nombre: string | null;
  };
  items: {
    id: string;
    nombre: string;
    descripcion: string | null;
    cantidad: number | null;
    unidad: string | null;
    presentacion: string | null;
    categoria_id: string | null;
    estatus: string | null;
  }[];
};

// Detalle de una recepción (fila del panel de auditoría al abrirla).
export async function getIngreso(id: string): Promise<IngresoDetalle | null> {
  const { sc, ok } = await puedeLogistica();
  if (!ok || !sc.uid || !id) return null;
  const a = createAdminClient();

  const { data: ing } = await a
    .from("ingresos")
    .select(
      "id, created_at, detalle, categorias, centro_id, foto_path, audio_path, doc_path, donante_id, created_by",
    )
    .eq("id", id)
    .maybeSingle();
  if (!ing) return null;
  // Logística solo ve sus propias recepciones.
  if (!sc.admin && (ing as any).created_by !== sc.uid) return null;

  const [{ data: don }, { data: items }] = await Promise.all([
    (ing as any).donante_id
      ? a
          .from("donantes")
          .select("id, nombre, apellido, razon_social")
          .eq("id", (ing as any).donante_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    a
      .from("inventario")
      .select("id, nombre, descripcion, cantidad, unidad, presentacion, categoria_id, estatus")
      .eq("ingreso_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return {
    ingreso: {
      id: (ing as any).id,
      created_at: (ing as any).created_at,
      detalle: (ing as any).detalle ?? null,
      categorias: (ing as any).categorias ?? [],
      centro_id: (ing as any).centro_id ?? null,
      foto_path: (ing as any).foto_path ?? null,
      audio_path: (ing as any).audio_path ?? null,
      doc_path: (ing as any).doc_path ?? null,
      donante_id: (ing as any).donante_id ?? null,
      donante_nombre: nombreDonante(don),
    },
    items: (items ?? []) as any[],
  };
}

// ── Media -> prefill de ítems (PASO 3, opcional) ──
// Sube el archivo al bucket `fotos` y usa la visión (LANE existente) para PRE-LLENAR ítems.
// Devuelve los ítems sugeridos + la ruta guardada (que el cliente reenvía al crear el ingreso).
export type ExtraerMediaResult =
  | {
      ok: true;
      items: { nombre: string; cantidad: number | null; unidad: string | null; presentacion: string | null }[];
      foto_path?: string | null;
      audio_path?: string | null;
      doc_path?: string | null;
      raw?: any;
    }
  | { ok: false; error: string };

async function subir(file: File, carpeta: string): Promise<{ path: string; buf: Buffer }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.type.split("/")[1] ?? "bin").replace("jpeg", "jpg");
  const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;
  const a = createAdminClient();
  const { error } = await a.storage.from("fotos").upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Storage: ${error.message}`);
  return { path, buf };
}

function mapInsumos(insumos: any[]): { nombre: string; cantidad: number | null; unidad: string | null; presentacion: string | null }[] {
  return (insumos ?? [])
    .filter((i) => i?.nombre)
    .map((i) => ({
      nombre: String(i.nombre),
      cantidad: typeof i.cantidad === "number" ? i.cantidad : null,
      unidad: i.unidad ?? null,
      presentacion: i.presentacion ?? null,
    }));
}

// FOTO / DOCUMENTO como imagen -> extrae ítems.
export async function extraerDeFoto(formData: FormData): Promise<ExtraerMediaResult> {
  const { ok } = await puedeLogistica();
  if (!ok) return { ok: false, error: "No tienes permiso." };
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No se recibió archivo." };
  try {
    const { path, buf } = await subir(file, "checkin");
    const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
    const res = await analizarDocumento(dataUrl);
    if (!res.ok) return { ok: false, error: res.motivo };
    return { ok: true, items: mapInsumos(res.data.insumos), foto_path: path, raw: res.data };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Error al procesar la imagen." };
  }
}

// AUDIO -> transcribe -> extrae ítems.
export async function extraerDeAudio(formData: FormData): Promise<ExtraerMediaResult> {
  const { ok } = await puedeLogistica();
  if (!ok) return { ok: false, error: "No tienes permiso." };
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No se recibió audio." };
  try {
    const { path, buf } = await subir(file, "checkin");
    const format = (file.type.split("/")[1] ?? "webm").split(";")[0];
    const texto = await transcribirAudio(buf.toString("base64"), format);
    if (!texto.trim()) return { ok: false, error: "No se entendió el audio, intenta de nuevo." };
    const res = await analizarTexto(texto);
    if (!res.ok) return { ok: false, error: res.motivo };
    return { ok: true, items: mapInsumos(res.data.insumos), audio_path: path, raw: res.data };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Error al procesar el audio." };
  }
}
