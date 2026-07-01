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
// APROBACIÓN: solo cuentan las membresías 'aprobado'. Un usuario auto-registrado tiene
// su(s) membresía(s) en 'pendiente' -> se le degrada el rol efectivo a 'publico' hasta
// que un admin lo apruebe (frontera de seguridad server-side; nunca solo en el cliente).
export async function getSesion(): Promise<{ rol: string; email: string | null; nombre: string | null; hospitalIds: string[]; centroIds: string[]; impersonando?: boolean; pendiente?: boolean } | null> {
  const { uid, impersonando } = await usuarioEfectivo();
  if (!uid) return null;
  // El perfil vive con service_role para no depender de RLS todavía.
  const admin = createAdminClient();
  const [{ data: perfil }, { data: mem }] = await Promise.all([
    admin.from("profiles").select("rol, nombre, email, activo").eq("id", uid).maybeSingle(),
    admin.from("membresias").select("hospital_id, centro_id, estado").eq("user_id", uid),
  ]);
  if (perfil && perfil.activo === false && !impersonando) return null;
  const rolBase = perfil?.rol ?? "publico";
  const aprobadas = (mem ?? []).filter((m: any) => m.estado === "aprobado");
  // Tiene membresías pero NINGUNA aprobada = registro pendiente. (Cero membresías = usuario
  // de confianza con rol fijado por un admin, p.ej. médico global; ese NO se degrada.)
  const pendiente = (mem ?? []).length > 0 && aprobadas.length === 0;
  const rol = rolBase !== "admin" && pendiente ? "publico" : rolBase;
  return {
    rol, email: perfil?.email ?? null, nombre: perfil?.nombre ?? null,
    hospitalIds: aprobadas.map((m: any) => m.hospital_id).filter(Boolean),
    centroIds: aprobadas.map((m: any) => m.centro_id).filter(Boolean),
    impersonando, pendiente,
  };
}

// Alcance del usuario efectivo para acciones de escritura: admin=global; resto=solo sus membresías.
// Frontera de seguridad: service_role salta RLS, así que CADA mutación debe verificar esto.
export async function getScope(): Promise<{ uid: string | null; admin: boolean; hospitalIds: string[]; centroIds: string[]; hospitalIdsTodos: string[]; centroIdsTodos: string[] }> {
  const { uid } = await usuarioEfectivo();
  if (!uid) return { uid: null, admin: false, hospitalIds: [], centroIds: [], hospitalIdsTodos: [], centroIdsTodos: [] };
  const a = createAdminClient();
  const { data: perfil } = await a.from("profiles").select("rol").eq("id", uid).maybeSingle();
  if (perfil?.rol === "admin") return { uid, admin: true, hospitalIds: [], centroIds: [], hospitalIdsTodos: [], centroIdsTodos: [] };
  // Solo membresías APROBADAS otorgan alcance de LECTURA/edición. Un registro pendiente
  // no puede ver ni cambiar estado hasta que un admin lo apruebe.
  // *Todos* (incl. pendiente) sí pueden CREAR una solicitud para su propio centro registrado.
  const { data: mem } = await a.from("membresias").select("hospital_id, centro_id, estado").eq("user_id", uid);
  const aprobadas = (mem ?? []).filter((m: any) => m.estado === "aprobado");
  const todas = mem ?? [];
  return {
    uid, admin: false,
    hospitalIds: aprobadas.map((m: any) => m.hospital_id).filter(Boolean),
    centroIds: aprobadas.map((m: any) => m.centro_id).filter(Boolean),
    hospitalIdsTodos: todas.map((m: any) => m.hospital_id).filter(Boolean),
    centroIdsTodos: todas.map((m: any) => m.centro_id).filter(Boolean),
  };
}

// Helper de APROBACIÓN reutilizable (para Agent B / solicitudes, etc.): ¿el usuario
// efectivo tiene acceso ampliado? admin=sí; sin membresías=usuario de confianza (sí);
// con membresías pero ninguna aprobada = registro pendiente (no). Server-side.
export async function estaAprobado(): Promise<boolean> {
  const { uid } = await usuarioEfectivo();
  if (!uid) return false;
  const a = createAdminClient();
  const { data: perfil } = await a.from("profiles").select("rol").eq("id", uid).maybeSingle();
  if (perfil?.rol === "admin") return true;
  const { data: mem } = await a.from("membresias").select("estado").eq("user_id", uid);
  if (!mem || mem.length === 0) return true;
  return mem.some((m: any) => m.estado === "aprobado");
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
