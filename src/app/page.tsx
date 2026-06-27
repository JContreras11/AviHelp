import { createAdminClient } from "@/lib/supabase/server";
import { getAnalytics } from "@/app/actions/analytics";
import { Captura } from "@/components/Captura";
import { Datos } from "@/components/datos/Datos";
import { Logo } from "@/components/Brand";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createAdminClient();
  const [{ data: personas }, { data: insumos }, analytics] = await Promise.all([
    supabase.from("personas")
      .select("id,nombre,cedula,edad,sexo,estado_salud,ubicacion,telefono_contacto,updated_at")
      .order("updated_at", { ascending: false }).limit(1000),
    supabase.from("insumos")
      .select("id,nombre,cantidad,unidad,prioridad,estado,hospitales(nombre)")
      .order("created_at", { ascending: false }).limit(1000),
    getAnalytics(),
  ]);

  return (
    <main className="flex-1 px-4 py-10 sm:py-14 bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="max-w-2xl mx-auto text-center mb-10 flex flex-col items-center">
        <Logo size={88} />
        <h1 className="mt-4 text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-[#5eead4] bg-clip-text text-transparent">
          Soy Avi
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Tómame una foto o háblame. Registro personas e insumos en la emergencia, al instante.
        </p>
      </div>

      <Captura />

      <div className="mt-14">
        <Datos personas={personas ?? []} insumos={insumos ?? []} hospitales={analytics.hospitales} />
      </div>
    </main>
  );
}
