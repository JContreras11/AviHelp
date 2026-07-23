import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarPorRevisar, rolesConPersonas } from "@/app/actions/inspeccion";
import { Inspeccion } from "@/components/inspeccion/Inspeccion";

export const dynamic = "force-dynamic";

// LANE E — Inspección / control de calidad. Acceso RESTRINGIDO a logística:
// admin (global) o quien pertenece a algún centro de acopio. El resto no entra.
export default async function InspeccionPage() {
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0) redirect("/");

  const [items, roles] = await Promise.all([listarPorRevisar(), rolesConPersonas()]);

  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Inspección</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control de calidad del stock recibido. Corrige cantidades y presentaciones, registra
          quién inspecciona y marca cada item como disponible, rechazado o dañado.
        </p>
      </header>
      <Inspeccion items={items} roles={roles} />
    </main>
  );
}
