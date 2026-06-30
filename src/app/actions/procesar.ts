"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { procesarImagen } from "@/lib/ai/image";
import { analizarDocumento, analizarTexto, transcribirAudio, categoriaDoc, type DocumentoAnalizado } from "@/lib/ai/vision";
import { indexar, textoPersona, textoInsumo } from "@/lib/ai/indexar";
import { mismaPersona, tokensNombre, camposFaltantes } from "@/lib/match-persona";
import type { ExifMeta } from "@/lib/exif";

export type ProcesarResult =
  | { ok: false; error: string }
  | {
      ok: true;
      tipo: DocumentoAnalizado["tipo"];
      contexto: string | null;
      confianza: number;
      modelo: string;
      foto: string | null;
      hospital_id: string | null;
      personas: any[];
      insumos: any[];
      creadas: number;
      actualizadas: number;
      resumen: string;
    };

// Normaliza cédula para dedup fiable: "V 29.790.834" -> "V29790834".
function normCedula(c: string | null): string | null {
  if (!c) return null;
  const n = c.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  return n || null;
}

const EXIF_VACIO: ExifMeta = { gps_lat: null, gps_lng: null, foto_fecha: null };

// Punto de entrada para FOTO: una imagen -> clasifica -> mapea a entidades.
export async function procesarDocumento(formData: FormData): Promise<ProcesarResult> {
  const file = formData.get("imagen");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No se recibió imagen." };

  const img = await procesarImagen(file, "documentos");
  const res = await analizarDocumento(img.dataUrl);
  if (!res.ok) return { ok: false, error: res.motivo };

  // Geolocalización del navegador como fallback si la foto no trae GPS en EXIF.
  const lat = parseFloat(String(formData.get("gps_lat") ?? ""));
  const lng = parseFloat(String(formData.get("gps_lng") ?? ""));
  const exif = {
    ...img.exif,
    gps_lat: img.exif.gps_lat ?? (isNaN(lat) ? null : lat),
    gps_lng: img.exif.gps_lng ?? (isNaN(lng) ? null : lng),
  };
  return guardar(res.data, res.confianza, res.modelo, img.path, exif);
}

// Punto de entrada para AUDIO/VOZ: texto transcrito -> mismas entidades.
export async function procesarTexto(texto: string): Promise<ProcesarResult> {
  if (!texto?.trim()) return { ok: false, error: "Texto vacío." };
  const res = await analizarTexto(texto);
  if (!res.ok) return { ok: false, error: res.motivo };
  return guardar(res.data, res.confianza, res.modelo, null, EXIF_VACIO);
}

export type AnalisisResult =
  | { ok: false; error: string }
  | {
      ok: true;
      preview: DocumentoAnalizado;
      foto: string | null;
      exif: ExifMeta;
      confianza: number;
      modelo: string;
    };

// FOTO: sube + analiza, devuelve PREVIEW editable (NO guarda en DB todavía).
export async function analizarImagen(formData: FormData): Promise<AnalisisResult> {
  const file = formData.get("imagen");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No se recibió imagen." };

  const img = await procesarImagen(file, "documentos");
  const res = await analizarDocumento(img.dataUrl);
  if (!res.ok) return { ok: false, error: res.motivo };

  const lat = parseFloat(String(formData.get("gps_lat") ?? ""));
  const lng = parseFloat(String(formData.get("gps_lng") ?? ""));
  const exif: ExifMeta = {
    ...img.exif,
    gps_lat: img.exif.gps_lat ?? (isNaN(lat) ? null : lat),
    gps_lng: img.exif.gps_lng ?? (isNaN(lng) ? null : lng),
  };
  return { ok: true, preview: res.data, foto: img.path, exif, confianza: res.confianza, modelo: res.modelo };
}

// VOZ: analiza texto, devuelve PREVIEW editable (NO guarda).
export async function analizarVoz(texto: string): Promise<AnalisisResult> {
  if (!texto?.trim()) return { ok: false, error: "Texto vacío." };
  const res = await analizarTexto(texto);
  if (!res.ok) return { ok: false, error: res.motivo };
  return { ok: true, preview: res.data, foto: null, exif: EXIF_VACIO, confianza: res.confianza, modelo: res.modelo };
}

// AUDIO: graba del micrófono -> transcribe (OpenRouter) -> analiza. PREVIEW editable.
export async function analizarAudio(formData: FormData): Promise<AnalisisResult> {
  const file = formData.get("audio");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No se recibió audio." };
  const buf = Buffer.from(await file.arrayBuffer());
  const fmt = (file.type.split("/")[1] ?? "webm").split(";")[0].replace("x-", "").replace("mpeg", "mp3");
  const texto = await transcribirAudio(buf.toString("base64"), fmt);
  if (!texto.trim()) return { ok: false, error: "No se entendió el audio, intenta de nuevo." };
  const res = await analizarTexto(texto);
  if (!res.ok) return { ok: false, error: res.motivo };
  res.data.contexto = `🎙️ "${texto}"`; // mostrar lo transcrito para verificar/corregir
  return { ok: true, preview: res.data, foto: null, exif: EXIF_VACIO, confianza: res.confianza, modelo: res.modelo };
}

// Guarda un PREVIEW ya editado por el usuario.
export async function guardarDocumento(input: {
  preview: DocumentoAnalizado;
  foto: string | null;
  exif: ExifMeta;
  confianza: number;
  modelo: string;
  notas?: string;
}): Promise<ProcesarResult> {
  return guardar(input.preview, input.confianza, input.modelo, input.foto, input.exif, input.notas);
}

// Persiste un documento ya analizado (compartido entre foto y voz).
async function guardar(
  d: DocumentoAnalizado,
  confianza: number,
  modelo: string,
  fotoPath: string | null,
  exif: ExifMeta,
  notas?: string,
): Promise<ProcesarResult> {
  const supabase = createAdminClient();
  const nota = notas?.trim() || null;
  const scope = await getScope();
  const uid = scope.uid;

  // 1) Hospital: si la UI ya emparejó una institución existente (id), se usa directo (sin duplicar).
  //    Si no, se busca por nombre y, en último caso, se crea (creación deliberada o no detectada).
  let hospitalId: string | null = null;
  if (d.hospital?.id) {
    hospitalId = d.hospital.id;
  } else if (d.hospital?.nombre) {
    const { data: existente } = await supabase
      .from("hospitales").select("id").eq("nombre", d.hospital.nombre).maybeSingle();
    if (existente) hospitalId = existente.id;
    else {
      const { data } = await supabase
        .from("hospitales")
        .insert({ nombre: d.hospital.nombre, ubicacion: d.hospital.ubicacion })
        .select("id").single();
      hospitalId = data?.id ?? null;
      // Institución NUEVA inferida por IA: si quien sube no es admin, lo hacemos
      // miembro para que pueda gestionar lo que acaba de registrar (el admin ya ve todo).
      if (hospitalId && uid && !scope.admin) {
        await supabase.from("membresias").insert({ user_id: uid, hospital_id: hospitalId, rol_local: "admin" });
      }
    }
  }

  // 1b) Carga: registro de ESTA subida (para "Mis Cargas"). Solo si hay usuario logueado;
  //     liga la foto + lo extraído al uploader. El resumen se completa al final.
  let cargaId: string | null = null;
  if (uid) {
    const { data: carga } = await supabase
      .from("cargas")
      .insert({
        user_id: uid,
        tipo: d.tipo,
        categoria: categoriaDoc(d),
        foto: fotoPath,
        contexto: [d.contexto, nota].filter(Boolean).join("\n") || null,
        hospital_id: hospitalId,
        confianza,
        modelo,
        raw: d as any,
      })
      .select("id")
      .single();
    cargaId = carga?.id ?? null;
  }

  // 2) Insumos -> al hospital detectado.
  const insumosGuardados: any[] = [];
  if (d.insumos.length && hospitalId) {
    const filas = d.insumos.filter((i) => i.nombre).map((i) => ({
      hospital_id: hospitalId,
      carga_id: cargaId,
      nombre: i.nombre,
      cantidad: i.cantidad,
      unidad: i.unidad,
      presentacion: i.presentacion ?? null,
      area: i.area ?? null,
      para_que_sirve: i.para_que_sirve ?? null,
      alternativas: i.alternativas ?? null,
      prioridad: i.prioridad ?? "media",
      estado: "solicitado",
      fuente: "ia_vision",
      confianza,
      raw_extraccion: i as any,
    }));
    const { data } = await supabase.from("insumos").insert(filas).select();
    insumosGuardados.push(...(data ?? []));
    // Tokeniza cada insumo para búsqueda/chat.
    for (const ins of data ?? [])
      await indexar(supabase, "insumos", ins.id, textoInsumo(ins, d.hospital?.nombre ?? undefined, nota ?? undefined),
        { hospital: d.hospital?.nombre ?? null, area: ins.area ?? null, estado: ins.estado });
  }

  // 3) Personas -> upsert por cédula normalizada (o nombre+edad) + historial.
  const personasGuardadas: any[] = [];
  let creadas = 0, actualizadas = 0;
  for (const p of d.personas) {
    if (!p.nombre) continue;
    const cedula = normCedula(p.cedula);
    const base = {
      nombre: p.nombre,
      cedula,
      edad: p.edad,
      sexo: p.sexo,
      ubicacion: p.ubicacion,
      estado_salud: p.estado_salud ?? "desconocido",
      descripcion_fisica: p.descripcion_fisica,
      telefono_contacto: p.telefono_contacto,
      contacto_nombre: p.contacto_nombre,
      notas: [p.notas, nota].filter(Boolean).join(" — ") || null,
      hospital_id: hospitalId,
      gps_lat: exif.gps_lat,
      gps_lng: exif.gps_lng,
      foto_fecha: exif.foto_fecha,
      fuente: "ia_vision",
      confianza,
      raw_extraccion: p as any,
      fotos: fotoPath ? [fotoPath] : [],
      carga_id: cargaId,
    };

    // Match: cédula manda; si falta, candidatos por tokens del nombre y decide por
    // nombre compatible + atributos (mismaPersona). "Juan Perez" puede ser "Juan A. Perez Oropeza".
    let existente: any = null;
    if (cedula) existente = (await supabase.from("personas").select("*").eq("cedula", cedula).maybeSingle()).data;
    if (!existente) {
      const toks = tokensNombre(p.nombre);
      if (toks.length) {
        const orFiltro = toks.slice(0, 4).map((t) => `nombre.ilike.%${t}%`).join(",");
        const { data: cands } = await supabase.from("personas").select("*").or(orFiltro).limit(25);
        const ref = { nombre: p.nombre, cedula, edad: p.edad ?? null, sexo: p.sexo ?? null, ubicacion: p.ubicacion ?? null, hospital_id: hospitalId };
        existente = (cands ?? []).find((c: any) => mismaPersona(ref, c)) ?? null;
      }
    }

    if (existente) {
      actualizadas++;
      // Rellena SOLO lo que falte: una lista nueva con menos info no borra datos buenos.
      const parche: any = camposFaltantes(existente, base);
      // Estado de salud: refresca si el nuevo aporta algo más preciso que lo conocido (+ historial).
      if (base.estado_salud && base.estado_salud !== "desconocido" && base.estado_salud !== existente.estado_salud) {
        parche.estado_salud = base.estado_salud;
        await supabase.from("persona_historial").insert({
          persona_id: existente.id,
          estado_salud: existente.estado_salud,
          ubicacion: existente.ubicacion,
          hospital_id: existente.hospital_id,
          nota: "Actualización por IA",
          fuente: "ia_vision",
        });
      }
      const fotos = [...new Set([...(existente.fotos ?? []), ...(fotoPath ? [fotoPath] : [])])].slice(0, 3);
      if (fotos.length !== (existente.fotos?.length ?? 0)) parche.fotos = fotos;
      const { data } = Object.keys(parche).length
        ? await supabase.from("personas").update(parche).eq("id", existente.id).select().single()
        : { data: existente };
      personasGuardadas.push(data);
    } else {
      creadas++;
      const { data } = await supabase.from("personas").insert(base).select().single();
      personasGuardadas.push(data);
    }
    const saved = personasGuardadas[personasGuardadas.length - 1];
    if (saved?.id) await indexar(supabase, "personas", saved.id, textoPersona(saved), { hospital: d.hospital?.nombre ?? null });
  }

  // Texto libre / contexto / transcripción: se guarda como documento buscable
  // aunque no haya entidades extraídas (ej. pegar una lista o nota de voz).
  const textoSuelto = [d.contexto, nota].filter(Boolean).join("\n");
  if (textoSuelto.trim())
    await indexar(supabase, "nota", crypto.randomUUID(), textoSuelto,
      { tipo: d.tipo, hospital: d.hospital?.nombre ?? null, foto: fotoPath });

  const resumen =
    `${d.tipo.replace(/_/g, " ")}: ` +
    [
      creadas && `${creadas} persona(s) nueva(s)`,
      actualizadas && `${actualizadas} ya existían (actualizadas)`,
      insumosGuardados.length && `${insumosGuardados.length} insumo(s)`,
      d.hospital?.nombre && `hospital ${d.hospital.nombre}`,
    ].filter(Boolean).join(", ");

  if (cargaId) await supabase.from("cargas").update({ resumen }).eq("id", cargaId);

  return {
    ok: true,
    tipo: d.tipo,
    contexto: d.contexto,
    confianza,
    modelo,
    foto: fotoPath,
    hospital_id: hospitalId,
    personas: personasGuardadas,
    insumos: insumosGuardados,
    creadas,
    actualizadas,
    resumen,
  };
}
