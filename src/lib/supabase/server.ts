import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase para Server Components / Server Actions (anon key + cookies de sesión).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // ponytail: ignorado en Server Components (solo lectura); el middleware refresca sesión.
          }
        },
      },
    },
  );
}

// Nombre de la cookie de impersonación (un admin "ve como" otro usuario). Igual en impersonar.ts.
export const IMP_COOKIE = "imp_uid";

// Usuario EFECTIVO: el real, salvo que un admin esté impersonando a otro (cookie imp_uid).
// Solo un admin real puede impersonar (si no, la cookie se ignora).
async function usuarioEfectivo(): Promise<{ realUid: string | null; uid: string | null; impersonando: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { realUid: null, uid: null, impersonando: false };
  const cookieStore = await cookies();
  const imp = cookieStore.get(IMP_COOKIE)?.value;
  if (imp && imp !== user.id) {
    const a = createAdminClient();
    const { data: yo } = await a.from("profiles").select("rol").eq("id", user.id).maybeSingle();
    if (yo?.rol === "admin") return { realUid: user.id, uid: imp, impersonando: true };
  }
  return { realUid: user.id, uid: user.id, impersonando: false };
}

// Sesión del usuario efectivo + su perfil/rol + sus membresías. Para Server Components.
export async function getSesion(): Promise<{ rol: string; email: string | null; nombre: string | null; hospitalIds: string[]; centroIds: string[]; impersonando?: boolean } | null> {
  const { uid, impersonando } = await usuarioEfectivo();
  if (!uid) return null;
  // El perfil vive con service_role para no depender de RLS todavía.
  const admin = createAdminClient();
  const [{ data: perfil }, { data: mem }] = await Promise.all([
    admin.from("profiles").select("rol, nombre, email, activo").eq("id", uid).maybeSingle(),
    admin.from("membresias").select("hospital_id, centro_id").eq("user_id", uid),
  ]);
  if (perfil && perfil.activo === false && !impersonando) return null;
  return {
    rol: perfil?.rol ?? "publico", email: perfil?.email ?? null, nombre: perfil?.nombre ?? null,
    hospitalIds: (mem ?? []).map((m: any) => m.hospital_id).filter(Boolean),
    centroIds: (mem ?? []).map((m: any) => m.centro_id).filter(Boolean),
    impersonando,
  };
}

// Alcance del usuario efectivo para acciones de escritura: admin=global; resto=solo sus membresías.
// Frontera de seguridad: service_role salta RLS, así que CADA mutación debe verificar esto.
export async function getScope(): Promise<{ uid: string | null; admin: boolean; hospitalIds: string[]; centroIds: string[] }> {
  const { uid } = await usuarioEfectivo();
  if (!uid) return { uid: null, admin: false, hospitalIds: [], centroIds: [] };
  const a = createAdminClient();
  const { data: perfil } = await a.from("profiles").select("rol").eq("id", uid).maybeSingle();
  if (perfil?.rol === "admin") return { uid, admin: true, hospitalIds: [], centroIds: [] };
  const { data: mem } = await a.from("membresias").select("hospital_id, centro_id").eq("user_id", uid);
  return {
    uid, admin: false,
    hospitalIds: (mem ?? []).map((m: any) => m.hospital_id).filter(Boolean),
    centroIds: (mem ?? []).map((m: any) => m.centro_id).filter(Boolean),
  };
}

// Cliente con service_role: salta RLS. SOLO en server actions de confianza (IA, escrituras masivas).
export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
}
