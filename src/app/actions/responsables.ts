"use server";

import { createAdminClient, getScope } from "@/lib/supabase/server";
import { registrarLog } from "@/app/actions/audit";

// Responsables de un hospital = usuarios reales (membresías). Seleccionar uno existente
// o crear uno al momento, con su contacto. Admin o miembro del hospital.
const DENEGADO = { ok: false as const, error: "No tienes permiso sobre este hospital." };

async function gestionaHospital(hospitalId: string) {
  const sc = await getScope();
  return sc.admin || sc.hospitalIds.includes(hospitalId);
}

export async function listarResponsables(hospitalId: string) {
  if (!(await gestionaHospital(hospitalId))) return [];
  const a = createAdminClient();
  const { data } = await a.from("membresias")
    .select("user_id, rol_local, profiles(nombre, email, telefono)")
    .eq("hospital_id", hospitalId);
  return (data ?? []).map((m: any) => ({
    user_id: m.user_id, rol_local: m.rol_local,
    nombre: m.profiles?.nombre ?? null, email: m.profiles?.email ?? null, telefono: m.profiles?.telefono ?? null,
  }));
}

// Usuarios para el selector de "asignar existente".
export async function usuariosParaAsignar() {
  const sc = await getScope();
  if (!sc.admin && sc.hospitalIds.length === 0) return [];
  const a = createAdminClient();
  const { data } = await a.from("profiles").select("id, nombre, email, telefono").order("nombre");
  return data ?? [];
}

// Copia el contacto del responsable al hospital para que el donante lo vea al "Quiero donar".
async function reflejarContacto(a: any, hospitalId: string, userId: string) {
  const { data: p } = await a.from("profiles").select("nombre, telefono").eq("id", userId).maybeSingle();
  if (p?.nombre || p?.telefono) {
    await a.from("hospitales").update({
      responsable_recepcion_nombre: p?.nombre ?? null,
      responsable_recepcion_contacto: p?.telefono ?? null,
    }).eq("id", hospitalId);
  }
}

export async function asignarResponsable(hospitalId: string, userId: string, rolLocal = "responsable") {
  if (!(await gestionaHospital(hospitalId))) return DENEGADO;
  const a = createAdminClient();
  // Idempotente: borra membresía previa de este user en este hospital y reinserta.
  await a.from("membresias").delete().eq("user_id", userId).eq("hospital_id", hospitalId);
  const { error } = await a.from("membresias").insert({
    user_id: userId, hospital_id: hospitalId, rol_local: rolLocal === "admin" ? "admin" : "responsable",
  });
  if (error) return { ok: false, error: error.message };
  await reflejarContacto(a, hospitalId, userId);
  await registrarLog("asignar", "responsable", hospitalId, { userId, rolLocal });
  return { ok: true };
}

export async function quitarResponsable(hospitalId: string, userId: string) {
  if (!(await gestionaHospital(hospitalId))) return DENEGADO;
  const a = createAdminClient();
  const { error } = await a.from("membresias").delete().eq("user_id", userId).eq("hospital_id", hospitalId);
  if (error) return { ok: false, error: error.message };
  await registrarLog("quitar", "responsable", hospitalId, { userId });
  return { ok: true };
}

// Crea un usuario nuevo y lo asigna como responsable de este hospital (con contacto).
export async function crearResponsable(hospitalId: string, campos: { nombre?: string; email: string; telefono?: string; password: string; rolLocal?: string }) {
  if (!(await gestionaHospital(hospitalId))) return DENEGADO;
  const email = campos.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "El correo es obligatorio." };
  if (!campos.password || campos.password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  const a = createAdminClient();
  const { data, error } = await a.auth.admin.createUser({ email, password: campos.password, email_confirm: true });
  if (error) return { ok: false, error: error.message };
  const uid = data.user.id;
  // El trigger crea el perfil; le ponemos nombre/teléfono/rol.
  await a.from("profiles").update({ nombre: campos.nombre ?? null, telefono: campos.telefono ?? null, rol: "voluntario", activo: true }).eq("id", uid);
  await a.from("membresias").insert({ user_id: uid, hospital_id: hospitalId, rol_local: campos.rolLocal === "admin" ? "admin" : "responsable" });
  await reflejarContacto(a, hospitalId, uid);
  await registrarLog("crear", "responsable", hospitalId, { uid, email });
  return { ok: true };
}
