"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";

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
  const { data } = await a.from("profiles")
    .select("id,email,nombre,rol,hospital_id,activo,created_at,hospitales(nombre)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function crearUsuario(campos: { email: string; password: string; nombre?: string; rol?: string; hospital_id?: string | null }) {
  const { a } = await exigirAdmin();
  const email = campos.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "El correo es obligatorio." };
  if (!campos.password || campos.password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  const rol = ROLES.includes(campos.rol ?? "") ? campos.rol : "voluntario";
  const { data, error } = await a.auth.admin.createUser({ email, password: campos.password, email_confirm: true });
  if (error) return { ok: false, error: error.message };
  // El trigger crea el perfil; le ponemos nombre/rol/hospital.
  const { error: e2 } = await a.from("profiles")
    .update({ nombre: campos.nombre ?? null, rol, hospital_id: campos.hospital_id || null, activo: true })
    .eq("id", data.user.id);
  return e2 ? { ok: false, error: e2.message } : { ok: true };
}

export async function actualizarUsuario(id: string, campos: { nombre?: string; rol?: string; hospital_id?: string | null; activo?: boolean }) {
  const { uid, a } = await exigirAdmin();
  if (id === uid && (campos.rol && campos.rol !== "admin" || campos.activo === false))
    return { ok: false, error: "No puedes quitarte a ti mismo el acceso de admin." };
  const limpio: Record<string, any> = {};
  if ("nombre" in campos) limpio.nombre = campos.nombre ?? null;
  if (campos.rol && ROLES.includes(campos.rol)) limpio.rol = campos.rol;
  if ("hospital_id" in campos) limpio.hospital_id = campos.hospital_id || null;
  if ("activo" in campos) limpio.activo = campos.activo;
  const { error } = await a.from("profiles").update(limpio).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function cambiarPasswordUsuario(id: string, password: string) {
  const { a } = await exigirAdmin();
  if (!password || password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  const { error } = await a.auth.admin.updateUserById(id, { password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function eliminarUsuario(id: string) {
  const { uid, a } = await exigirAdmin();
  if (id === uid) return { ok: false, error: "No puedes eliminar tu propia cuenta." };
  const { error } = await a.auth.admin.deleteUser(id); // FK on delete cascade borra el perfil
  return error ? { ok: false, error: error.message } : { ok: true };
}
