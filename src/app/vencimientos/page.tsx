import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { proximosAVencer } from "@/app/actions/vencimientos";
import { Vencimientos } from "@/components/vencimientos/Vencimientos";

export const dynamic = "force-dynamic";

// ALERTAS DE VENCIMIENTO — vista RESTRINGIDA (logística/médico/admin).
// Surfacea medicamentos e insumos perecederos a punto de caducar para priorizar su
// envío al hospital antes de que venzan.
export default async function VencimientosPage() {
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0 && sc.hospitalIds.length === 0) redirect("/");

  const items = await proximosAVencer(60);

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">📊 Panel de necesidades →</Link>
      </div>
      <h1 className="text-2xl font-bold mt-2 mb-1">Alertas de vencimiento</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Medicamentos e insumos perecederos que caducan pronto. Prioriza su envío al hospital
        antes de que venzan — lo más urgente aparece primero.
      </p>
      <Vencimientos items={items} />
    </main>
  );
}
