import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { listarConciliacion } from "@/app/actions/match";
import { Triage } from "@/components/admin/Triage";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const s = await getSesion();
  // Admin global o coordinador (miembro de algún hospital).
  if (!s || (s.rol !== "admin" && (s.hospitalIds?.length ?? 0) === 0)) redirect("/");
  const rows = await listarConciliacion();

  return (
    <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Triage logístico</h1>
      <p className="text-sm text-muted-foreground mb-6">Conciliación en vivo: cada necesidad y las donaciones que la cubren. Prioriza lo que requiere atención — críticas sin cobertura, discrepancias y entregas estancadas.</p>
      <Triage inicial={rows as any} />
    </main>
  );
}
