"use server";

import { createAdminClient, getSesion } from "@/lib/supabase/server";
import { lugaresEntrega } from "@/app/actions/donaciones";

// TOOL de consulta de entidad para el chat (y reutilizable). Devuelve datos de
// hospitales/clínicas/refugios, insumos (necesidades), centros y personas,
// SIEMPRE filtrados por el rol del usuario efectivo. Frontera de seguridad: aquí
// se decide qué campos puede ver cada quién (el chat solo redacta lo que reciba).
//
// Roles "admin reales": admin + medico (ven todo, incl. responsables y contactos).
// voluntario / personal de centro: solo lo de SUS instituciones + necesidades públicas.
// publico / anónimo: solo info pública (ubicación, necesidades, desaparecidos).

type Filtro = { nombre?: string; ubicacion?: string; id?: string; estado?: string };
export type Entidad = "hospital" | "insumo" | "centro" | "persona";

const like = (v?: string) => `%${(v ?? "").trim()}%`;

export async function consultarEntidad(entidad: Entidad, filtro: Filtro = {}) {
  const s = await getSesion();
  const rol = s?.rol ?? "publico";
  const adminReal = rol === "admin" || rol === "medico";
  const hospitalIds = s?.hospitalIds ?? [];
  const a = createAdminClient();

  if (entidad === "hospital") {
    let q = a.from("hospitales")
      .select("id,nombre,tipo,ubicacion,gps_lat,gps_lng,responsable_recepcion_nombre,responsable_recepcion_contacto")
      .limit(5);
    if (filtro.id) q = q.eq("id", filtro.id);
    else if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
    const { data } = await q;
    const rows = [] as any[];
    for (const h of data ?? []) {
      const tipoTxt = h.tipo === "clinica" ? "Clínica" : h.tipo === "refugio" ? "Refugio" : "Hospital";
      const base: any = { tipo: tipoTxt, nombre: h.nombre, ubicacion: h.ubicacion ?? null };
      // Dónde entregar donaciones para este hospital (refugios cercanos + centros). Info pública.
      if (tipoTxt !== "Refugio") base.donde_entregar_donaciones = await lugaresEntrega(h.id);
      const puedeVerResp = adminReal || hospitalIds.includes(h.id);
      if (puedeVerResp) {
        const { data: miembros } = await a.from("membresias").select("user_id, rol_local").eq("hospital_id", h.id);
        const ids = (miembros ?? []).map((m: any) => m.user_id).filter(Boolean);
        let profs: any[] = [];
        if (ids.length) profs = (await a.from("profiles").select("id,nombre,telefono,email,rol").in("id", ids)).data ?? [];
        base.responsable_recepcion = h.responsable_recepcion_nombre || h.responsable_recepcion_contacto
          ? { nombre: h.responsable_recepcion_nombre, contacto: h.responsable_recepcion_contacto } : null;
        base.responsables = (miembros ?? []).map((m: any) => {
          const p = profs.find((x) => x.id === m.user_id) || {};
          return { rol_local: m.rol_local, nombre: p.nombre ?? null, telefono: p.telefono ?? null, email: p.email ?? null };
        });
      } else {
        base.acceso = "RESTRINGIDO: los datos del responsable/contacto son solo para administradores, médicos o personal del centro. Para el público solo se comparte la ubicación.";
      }
      rows.push(base);
    }
    return { entidad, rol, rows };
  }

  if (entidad === "insumo") {
    // Las necesidades son públicas (el objetivo es que lleguen los insumos).
    let q = a.from("insumos")
      .select("nombre,cantidad,unidad,prioridad,estado,area,hospitales(nombre,ubicacion)")
      .in("estado", ["solicitado", "en_transito"]).order("prioridad").limit(40);
    if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
    const { data } = await q;
    return { entidad, rol, rows: data ?? [] };
  }

  if (entidad === "centro") {
    let q = a.from("centros_acopio").select("nombre,zona,ubicacion,horario,recibe,necesita,contacto_nombre,contacto_telefono,activo").limit(20);
    if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
    const { data } = await q;
    return { entidad, rol, rows: data ?? [] };
  }

  // persona
  const campos = "nombre,cedula,edad,sexo,ubicacion,estado_salud,descripcion_fisica,telefono_contacto,contacto_nombre,hospital_id";
  let q = a.from("personas").select(campos).limit(20);
  if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
  if (filtro.ubicacion) q = q.ilike("ubicacion", like(filtro.ubicacion));
  if (adminReal) {
    // ve todo
  } else if (hospitalIds.length) {
    // voluntario/personal: sus hospitales + desaparecidos públicos
    q = q.or(`hospital_id.in.(${hospitalIds.join(",")}),estado_salud.eq.desaparecido`);
  } else {
    // publico/anónimo: solo desaparecidos (los pacientes hospitalizados son privados)
    q = q.eq("estado_salud", "desaparecido");
  }
  if (filtro.estado) q = q.eq("estado_salud", filtro.estado);
  const { data } = await q;
  return { entidad, rol, rows: data ?? [], nota: adminReal ? null : "Solo se muestran desaparecidos (público) y, si aplica, personas de tu institución. Los pacientes hospitalizados son privados." };
}
