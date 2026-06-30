import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { listarTriage } from "@/app/actions/match";
import { Triage } from "@/components/admin/Triage";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const s = await getSesion();
  // Admin global o coordinador (miembro de algún hospital).
  if (!s || (s.rol !== "admin" && (s.hospitalIds?.length ?? 0) === 0)) redirect("/");
  const rows = await listarTriage();

  return (
    <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Triage logístico</h1>
      <p className="text-sm text-muted-foreground mb-6">Emparejamientos sugeridos por IA entre ofertas externas y necesidades. Apruébalos para reservar y notificar.</p>
      <Triage inicial={rows} />
    </main>
  );
}
