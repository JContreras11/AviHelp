import { contarTodo } from "@/app/actions/listas";
import { Captura } from "@/components/Captura";
import { Datos } from "@/components/datos/Datos";
import { HomeCards } from "@/components/HomeCards";
import { Bienvenida } from "@/components/Bienvenida";
import { LandingPublico } from "@/components/LandingPublico";
import { Logo } from "@/components/Brand";
import { getSesion, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Solo conteos (rápido). Las listas las pide cada tab con TanStack Query.
  const counts = await contarTodo();

  // Visitante anónimo: SOLO Avi (chat) + ver qué insumos faltan + donar. Nada más.
  const s = await getSesion();
  if (!s) {
    const { data: insumos } = await createAdminClient()
      .from("insumos")
      .select("id,nombre,cantidad,unidad,prioridad,hospital_id,hospitales(nombre)")
      .in("estado", ["solicitado", "en_transito"])
      .order("prioridad")
      .limit(40);
    return <LandingPublico insumos={insumos ?? []} />;
  }

  return (
    <main className="flex-1 px-4 py-10 sm:py-14 bg-gradient-to-b from-primary/5 via-background to-background">
      <Bienvenida />
      <div className="max-w-2xl mx-auto text-center mb-10 flex flex-col items-center">
        <Logo size={88} />
        <h1 className="mt-4 text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-[#5eead4] bg-clip-text text-transparent">
          Soy Avi
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Consulta las necesidades de hospitales, insumos y centros de acopio en la emergencia.
        </p>
      </div>

      <Captura />

      <HomeCards counts={counts} />

      <div id="datos" className="mt-12 scroll-mt-20">
        <Datos counts={counts} />
      </div>
    </main>
  );
}
