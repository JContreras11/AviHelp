import { contarTodo } from "@/app/actions/listas";
import { Captura } from "@/components/Captura";
import { Datos } from "@/components/datos/Datos";
import { HomeCards } from "@/components/HomeCards";
import { Logo } from "@/components/Brand";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Solo conteos (rápido). Las listas las pide cada tab con TanStack Query.
  const counts = await contarTodo();

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

      <HomeCards counts={counts} />

      <div id="datos" className="mt-12 scroll-mt-20">
        <Datos counts={counts} />
      </div>
    </main>
  );
}
