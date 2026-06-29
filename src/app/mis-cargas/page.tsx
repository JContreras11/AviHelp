import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { misCargas } from "@/app/actions/cargas";
import { MisCargas } from "@/components/MisCargas";

export const dynamic = "force-dynamic";

export default async function MisCargasPage() {
  const s = await getSesion();
  if (!s) redirect("/login");
  const cargas = await misCargas();

  return (
    <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Mis cargas</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Lo que has subido (fotos, listas y notas de voz) con la información que la IA extrajo. Toca una imagen para ampliarla; toca una persona o insumo para ver y editar.
      </p>
      <MisCargas inicial={cargas} />
    </main>
  );
}
