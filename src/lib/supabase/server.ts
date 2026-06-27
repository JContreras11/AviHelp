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

// Sesión del usuario autenticado + su perfil/rol. Para Server Components.
export async function getSesion(): Promise<{ rol: string; email: string | null; nombre: string | null } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // El perfil vive con service_role para no depender de RLS todavía.
  const admin = createAdminClient();
  const { data: perfil } = await admin.from("profiles").select("rol, nombre, activo").eq("id", user.id).maybeSingle();
  if (perfil && perfil.activo === false) return null;
  return { rol: perfil?.rol ?? "publico", email: user.email ?? null, nombre: perfil?.nombre ?? null };
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
