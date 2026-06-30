import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión y exige login. Sin sesión -> /login.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Rutas públicas (sin login): chat con Avi, qué falta + donar, y refugios/desaparecidos
  // en modo solo lectura/búsqueda. Lo demás (panel, admin, registrar) exige iniciar sesión.
  const PUB = ["/", "/login", "/chat", "/desaparecidos", "/refugios", "/api/chat", "/api/audio"];
  // /solicitud/[slug] = página pública por solicitud (difundir en redes/ONG). El panel /solicitudes (plural) sí exige login.
  const esPublica = PUB.includes(path) || path.startsWith("/compartir") || path.startsWith("/ofrecer") || path.startsWith("/solicitud/");
  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Excluye estáticos, imágenes, manifest y service worker.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
