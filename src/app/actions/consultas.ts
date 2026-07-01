"use server";

import { createAdminClient, getSesion, getScope } from "@/lib/supabase/server";
import { lugaresEntrega } from "@/app/actions/donaciones";
import { resolverHospitalConLLM } from "@/app/actions/solicitudes";

// TOOL de consulta de entidad para el chat (y reutilizable). Devuelve datos de
// hospitales/clínicas/refugios, insumos (necesidades), centros y personas,
// SIEMPRE filtrados por el rol del usuario efectivo. Frontera de seguridad: aquí
// se decide qué campos puede ver cada quién (el chat solo redacta lo que reciba).
//
// Roles "admin reales": admin + medico (ven todo, incl. responsables y contactos).
// voluntario / personal de centro: solo lo de SUS instituciones + necesidades públicas.
// publico / anónimo: solo info pública (ubicación, necesidades, desaparecidos).

type Filtro = { nombre?: string; ubicacion?: string; id?: string; estado?: string; hospital?: string };
export type Entidad = "hospital" | "refugio" | "insumo" | "centro" | "persona" | "donacion";

const like = (v?: string) => `%${(v ?? "").trim()}%`;
// Enlace de "cómo llegar" (desde la ubicación del usuario) a un lugar con o sin gps.
const comoLlegar = (r: any) =>
  r.gps_lat != null && r.gps_lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${r.gps_lat},${r.gps_lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${r.nombre ?? ""} ${r.ubicacion ?? r.zona ?? ""} Venezuela`)}`;

export async function consultarEntidad(entidad: Entidad, filtro: Filtro = {}) {
  const s = await getSesion();
  // GATING DE APROBACIÓN: getSesion ya degrada a 'publico' y vacía hospitalIds/centroIds
  // cuando el registro está pendiente. Reforzamos aquí de forma defensiva: un usuario
  // pendiente SIEMPRE ve datos a nivel público (nunca responsables/contactos/pacientes),
  // aunque su perfil pida médico/voluntario. La aprobación la da un admin.
  const rol = s?.pendiente ? "publico" : (s?.rol ?? "publico");
  const adminReal = rol === "admin" || rol === "medico";
  const hospitalIds = s?.pendiente ? [] : (s?.hospitalIds ?? []);
  const a = createAdminClient();

  if (entidad === "hospital") {
    let targetId = filtro.id || null;
    if (!targetId && filtro.nombre) {
      const { data: allHosp } = await a.from("hospitales").select("id, nombre");
      if (allHosp) {
        const resolved = await resolverHospitalConLLM(filtro.nombre, allHosp);
        if (resolved) targetId = resolved.id;
      }
    }
    let q = a.from("hospitales")
      .select("id,nombre,tipo,ubicacion,gps_lat,gps_lng,responsable_recepcion_nombre,responsable_recepcion_contacto")
      .limit(5);
    if (targetId) q = q.eq("id", targetId);
    else if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
    const { data } = await q;
    const rows = [] as any[];
    for (const h of data ?? []) {
      const tipoTxt = h.tipo === "clinica" ? "Clínica" : h.tipo === "refugio" ? "Refugio" : h.tipo === "centro" ? "Centro de acopio" : "Hospital";
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
      .select("id,nombre,cantidad,unidad,presentacion,prioridad,estado,area,hospital_id,hospitales(nombre,ubicacion)")
      .in("estado", ["solicitado", "en_transito"]).order("prioridad").limit(40);
    if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
    const { data } = await q;
    return { entidad, rol, rows: data ?? [] };
  }

  if (entidad === "centro") {
    let q = a.from("centros_acopio").select("nombre,zona,ubicacion,horario,recibe,necesita,contacto_nombre,contacto_telefono,activo,gps_lat,gps_lng").limit(20);
    if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
    const { data } = await q;
    return { entidad, rol, rows: (data ?? []).map((x: any) => ({ ...x, como_llegar: comoLlegar(x) })) };
  }

  if (entidad === "refugio") {
    // ¿Refugios CERCANOS a un hospital? -> usa la relación por cercanía (hospital_refugio) + centros.
    if (filtro.hospital) {
      let targetHospNombre = filtro.hospital;
      const { data: allHosp } = await a.from("hospitales").select("id, nombre");
      if (allHosp) {
        const resolved = await resolverHospitalConLLM(filtro.hospital, allHosp);
        if (resolved) targetHospNombre = resolved.nombre;
      }
      const { data: h } = await a.from("hospitales").select("id,nombre,ubicacion").neq("tipo", "refugio").ilike("nombre", like(targetHospNombre)).limit(1).maybeSingle();
      if (h) {
        const lugares = await lugaresEntrega(h.id);
        return {
          entidad, rol, hospital: h.nombre,
          rows: lugares.map((x: any) => ({ nombre: x.nombre, tipo: x.tipo, ubicacion: x.ubicacion ?? x.zona ?? null, como_llegar: comoLlegar(x) })),
        };
      }
    }
    // Lista / búsqueda de refugios.
    let q = a.from("hospitales").select("id,nombre,ubicacion,gps_lat,gps_lng").eq("tipo", "refugio").limit(20);
    if (filtro.nombre) q = q.ilike("nombre", like(filtro.nombre));
    if (filtro.ubicacion) q = q.ilike("ubicacion", like(filtro.ubicacion));
    const { data } = await q;
    return { entidad, rol, rows: (data ?? []).map((x: any) => ({ nombre: x.nombre, ubicacion: x.ubicacion, como_llegar: comoLlegar(x) })) };
  }

  if (entidad === "donacion") {
    // Donaciones (ofertas + su entrega) READ-ONLY por rol. Cada una enlaza a su
    // página pública de estado /donaciones/{codigo} (la del entrega) y al panel /mis-donaciones.
    // admin/medico: las más recientes (vista global). Logueado normal: SOLO las suyas. Anónimo: nada.
    const sc = await getScope();
    if (!sc.uid) {
      return { entidad, rol, rows: [], nota: "Inicia sesión para ver el estado de tus donaciones." };
    }
    let q = a.from("ofertas")
      .select("id,codigo,tipo,descripcion,cantidad,estatus,created_at,refugio_id,hospitales:refugio_id(nombre,ubicacion),entregas(codigo,estado,recibido_at)")
      .order("created_at", { ascending: false }).limit(adminReal ? 40 : 100);
    if (!adminReal) q = q.eq("usuario_oferente_id", sc.uid);
    if (filtro.nombre) q = q.ilike("descripcion", like(filtro.nombre));
    const { data } = await q;
    const rows = (data ?? []).map((o: any) => {
      const ent = Array.isArray(o.entregas) ? o.entregas[0] : o.entregas;
      const codigo = ent?.codigo ?? o.codigo ?? null;
      return {
        descripcion: o.descripcion, tipo: o.tipo, cantidad: o.cantidad,
        estatus: o.estatus, entrega_estado: ent?.estado ?? null,
        centro: o.hospitales?.nombre ?? null, ubicacion: o.hospitales?.ubicacion ?? null,
        codigo,
        // Enlace público de seguimiento (si ya hay entrega con código) o el panel del usuario.
        url: codigo ? `/donaciones/${codigo}` : "/mis-donaciones",
      };
    });
    return { entidad, rol, rows, nota: adminReal ? null : "Estas son TUS donaciones registradas." };
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
