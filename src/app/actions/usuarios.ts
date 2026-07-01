"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// CRUD de usuarios — SOLO admin. service_role salta RLS, así que cada acción
// reverifica que quien llama es admin (frontera de seguridad, no confiar en la UI).
async function exigirAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const a = createAdminClient();
  const { data: perfil } = await a.from("profiles").select("rol").eq("id", user.id).maybeSingle();
  if (perfil?.rol !== "admin") throw new Error("No autorizado");
  return { uid: user.id, a };
}

const ROLES = ["admin", "medico", "voluntario", "ong", "publico"];

export async function listarUsuarios() {
  const { a } = await exigirAdmin();
  // Todos los usuarios de auth, aunque les falte perfil (creados por SQL antes del trigger).
  const [{ data: authList }, { data: perfiles }] = await Promise.all([
    a.auth.admin.listUsers({ perPage: 1000 }),
    a.from("profiles").select("id,email,nombre,telefono,rol,hospital_id,activo,hospitales(nombre)"),
  ]);
  const byId = new Map((perfiles ?? []).map((p: any) => [p.id, p]));
  return (authList?.users ?? []).map((u: any) => {
    const p: any = byId.get(u.id) ?? {};
    return {
      id: u.id,
      email: p.email ?? u.email ?? null,
      nombre: p.nombre ?? null,
      telefono: p.telefono ?? null,
      rol: p.rol ?? "publico",
      hospital_id: p.hospital_id ?? null,
      activo: p.activo ?? true,
      hospitales: p.hospitales ?? null,
      created_at: u.created_at,
    };
  }).sort((x: any, y: any) => (y.created_at ?? "").localeCompare(x.created_at ?? ""));
}

// ── Instituciones + membresías (M:M usuario ↔ hospital/centro) ──
export async function listarInstituciones() {
  const { a } = await exigirAdmin();
  const [{ data: hospitales }, { data: centros }] = await Promise.all([
    a.from("hospitales").select("id,nombre,tipo").order("nombre"),
    a.from("centros_acopio").select("id,nombre").order("nombre"),
  ]);
  return { hospitales: hospitales ?? [], centros: centros ?? [] };
}

export async function getMembresias(userId: string) {
  const { a } = await exigirAdmin();
  const { data } = await a.from("membresias").select("hospital_id,centro_id,rol_local").eq("user_id", userId);
  const roles: Record<string, string> = {};
  for (const m of data ?? []) { const id = m.hospital_id ?? m.centro_id; if (id) roles[id] = m.rol_local ?? "responsable"; }
  return {
    hospitalIds: (data ?? []).map((m: any) => m.hospital_id).filter(Boolean) as string[],
    centroIds: (data ?? []).map((m: any) => m.centro_id).filter(Boolean) as string[],
    roles,
  };
}

type Memb = { id: string; rol_local?: string };
export async function setMembresias(userId: string, hospitales: Memb[], centros: Memb[]) {
  const { a } = await exigirAdmin();
  // Reemplazo total: borra y reinserta (pocas filas por usuario).
  await a.from("membresias").delete().eq("user_id", userId);
  const rl = (r?: string) => (r === "admin" ? "admin" : "responsable");
  // Un admin asigna instituciones -> membresías APROBADAS (acceso inmediato).
  const filas = [
    ...hospitales.map((h) => ({ user_id: userId, hospital_id: h.id, rol_local: rl(h.rol_local), estado: "aprobado" })),
    ...centros.map((c) => ({ user_id: userId, centro_id: c.id, rol_local: rl(c.rol_local), estado: "aprobado" })),
  ];
  if (filas.length === 0) { await registrarLog("editar", "usuario", userId, { membresias: 0 }); return { ok: true }; }
  const { error } = await a.from("membresias").insert(filas);
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "usuario", userId, { membresias: filas.length });
  return { ok: true };
}

export async function crearUsuario(campos: { email: string; password: string; nombre?: string; telefono?: string; rol?: string; hospital_id?: string | null }) {
  const { a } = await exigirAdmin();
  const email = campos.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "El correo es obligatorio." };
  if (!campos.password || campos.password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  const rol = ROLES.includes(campos.rol ?? "") ? campos.rol : "voluntario";
  const { data, error } = await a.auth.admin.createUser({ email, password: campos.password, email_confirm: true });
  if (error) return { ok: false, error: error.message };
  // El trigger crea el perfil; le ponemos nombre/teléfono/rol/hospital.
  const { error: e2 } = await a.from("profiles")
    .update({ nombre: campos.nombre ?? null, telefono: campos.telefono ?? null, rol, hospital_id: campos.hospital_id || null, activo: true })
    .eq("id", data.user.id);
  if (e2) return { ok: false, error: e2.message };
  await registrarLog("crear", "usuario", data.user.id, { email, rol });
  return { ok: true, userId: data.user.id };
}

export async function actualizarUsuario(id: string, campos: { nombre?: string; telefono?: string; rol?: string; hospital_id?: string | null; activo?: boolean }) {
  const { uid, a } = await exigirAdmin();
  if (id === uid && (campos.rol && campos.rol !== "admin" || campos.activo === false))
    return { ok: false, error: "No puedes quitarte a ti mismo el acceso de admin." };
  const limpio: Record<string, any> = {};
  if ("nombre" in campos) limpio.nombre = campos.nombre ?? null;
  if ("telefono" in campos) limpio.telefono = campos.telefono ?? null;
  if (campos.rol && ROLES.includes(campos.rol)) limpio.rol = campos.rol;
  if ("hospital_id" in campos) limpio.hospital_id = campos.hospital_id || null;
  if ("activo" in campos) limpio.activo = campos.activo;
  const { error } = await a.from("profiles").update(limpio).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await registrarLog("editar", "usuario", id, limpio);
  return { ok: true };
}

export async function cambiarPasswordUsuario(id: string, password: string) {
  const { a } = await exigirAdmin();
  if (!password || password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  const { error } = await a.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, error: error.message };
  await registrarLog("password", "usuario", id);
  return { ok: true };
}

export async function eliminarUsuario(id: string) {
  const { uid, a } = await exigirAdmin();
  if (id === uid) return { ok: false, error: "No puedes eliminar tu propia cuenta." };
  const { error } = await a.auth.admin.deleteUser(id); // FK on delete cascade borra el perfil
  if (error) return { ok: false, error: error.message };
  await registrarLog("eliminar", "usuario", id);
  return { ok: true };
}

// ── REGISTRO PÚBLICO (auto-servicio) ──────────────────────────────────────
// Lista de hospitales/instituciones para el selector del registro. PÚBLICA (no admin):
// solo nombre + tipo, sin datos sensibles. Se usa en la página /registro.
export async function institucionesPublicas() {
  const a = createAdminClient();
  const { data } = await a.from("hospitales").select("id,nombre,tipo").order("nombre");
  return (data ?? []) as { id: string; nombre: string; tipo: string | null }[];
}

const ROLES_SOLICITABLES = ["medico", "voluntario", "ong"];

// El usuario ya creó su cuenta (auth.signUp -> sesión iniciada) y ahora pide acceso
// atado a UNA institución existente. Crea una membresía PENDIENTE (sin auto-aprobar).
// El rol solicitado se guarda en el perfil pero NO da acceso hasta la aprobación
// (getSesion degrada a 'publico' mientras la membresía siga pendiente).
export async function solicitarAcceso(input: {
  hospitalId?: string | null; rol?: string; nombre?: string; telefono?: string;
}) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Primero crea tu cuenta e inicia sesión." };

  const hospitalId = input.hospitalId || null;
  if (!hospitalId) return { ok: false, error: "Selecciona la institución a la que perteneces." };
  const rol = ROLES_SOLICITABLES.includes(input.rol ?? "") ? input.rol! : "voluntario";
  const a = createAdminClient();

  // Idempotente: si ya pidió acceso a esa institución, no dupliques la membresía.
  const { data: existe } = await a.from("membresias")
    .select("id, estado").eq("user_id", user.id).eq("hospital_id", hospitalId).maybeSingle();

  if (!existe) {
    const { error } = await a.from("membresias").insert({
      user_id: user.id, hospital_id: hospitalId, rol_local: "responsable", estado: "pendiente",
    });
    if (error) return { ok: false, error: error.message };
  }

  // Guarda nombre/teléfono y el rol SOLICITADO (efectivo solo tras la aprobación).
  await a.from("profiles").update({
    nombre: input.nombre?.trim() || null,
    telefono: input.telefono?.trim() || null,
    rol,
  }).eq("id", user.id);

  await registrarLog("registro", "usuario", user.id, { hospitalId, rol, estado: existe?.estado ?? "pendiente" });
  return { ok: true, yaAprobado: existe?.estado === "aprobado" };
}

// ── APROBACIÓN DE REGISTROS (solo admin) ───────────────────────────────────
export async function listarRegistrosPendientes() {
  const { a } = await exigirAdmin();
  const { data: mem } = await a.from("membresias")
    .select("id, user_id, hospital_id, centro_id, rol_local, created_at")
    .eq("estado", "pendiente").order("created_at", { ascending: true });
  if (!mem || mem.length === 0) return [];
  const userIds = [...new Set(mem.map((m: any) => m.user_id))];
  const hospIds = [...new Set(mem.map((m: any) => m.hospital_id).filter(Boolean))];
  const centIds = [...new Set(mem.map((m: any) => m.centro_id).filter(Boolean))];
  const [{ data: perfiles }, { data: hosps }, { data: cents }] = await Promise.all([
    a.from("profiles").select("id,email,nombre,telefono,rol").in("id", userIds),
    hospIds.length ? a.from("hospitales").select("id,nombre").in("id", hospIds) : Promise.resolve({ data: [] }),
    centIds.length ? a.from("centros_acopio").select("id,nombre").in("id", centIds) : Promise.resolve({ data: [] }),
  ]);
  const pById = new Map((perfiles ?? []).map((p: any) => [p.id, p]));
  const hById = new Map((hosps ?? []).map((h: any) => [h.id, h.nombre]));
  const cById = new Map((cents ?? []).map((c: any) => [c.id, c.nombre]));
  return mem.map((m: any) => {
    const p: any = pById.get(m.user_id) ?? {};
    return {
      membresiaId: m.id,
      userId: m.user_id,
      email: p.email ?? null,
      nombre: p.nombre ?? null,
      telefono: p.telefono ?? null,
      rolSolicitado: p.rol ?? "voluntario",
      institucion: m.hospital_id ? (hById.get(m.hospital_id) ?? "—") : (cById.get(m.centro_id) ?? "—"),
      created_at: m.created_at,
    };
  });
}

export async function aprobarRegistro(membresiaId: string, rol?: string) {
  const { a } = await exigirAdmin();
  const { data: m } = await a.from("membresias").select("user_id").eq("id", membresiaId).maybeSingle();
  if (!m) return { ok: false, error: "Registro no encontrado." };
  const { error } = await a.from("membresias").update({ estado: "aprobado" }).eq("id", membresiaId);
  if (error) return { ok: false, error: error.message };
  // El admin confirma/ajusta el rol otorgado (por defecto el solicitado).
  if (rol && ROLES.includes(rol)) await a.from("profiles").update({ rol }).eq("id", m.user_id);
  await registrarLog("aprobar", "registro", m.user_id, { membresiaId, rol: rol ?? null });
  return { ok: true };
}

export async function rechazarRegistro(membresiaId: string) {
  const { a } = await exigirAdmin();
  const { data: m } = await a.from("membresias").select("user_id").eq("id", membresiaId).maybeSingle();
  if (!m) return { ok: false, error: "Registro no encontrado." };
  const { error } = await a.from("membresias").update({ estado: "rechazado" }).eq("id", membresiaId);
  if (error) return { ok: false, error: error.message };
  await registrarLog("rechazar", "registro", m.user_id, { membresiaId });
  return { ok: true };
}
