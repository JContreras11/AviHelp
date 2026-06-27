import { createAdminClient } from "@/lib/supabase/server";
import { Captura } from "@/components/Captura";
import { Registros } from "@/components/registros/Registros";
import { Logo } from "@/components/Brand";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createAdminClient();
  const [{ data: personas }, { data: insumos }] = await Promise.all([
    supabase.from("personas").select("*").order("updated_at", { ascending: false }).limit(12),
    supabase.from("insumos").select("*, hospitales(nombre)").order("created_at", { ascending: false }).limit(12),
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
        <Registros personas={personas ?? []} insumos={insumos ?? []} />
      </div>
    </main>
  );
}
