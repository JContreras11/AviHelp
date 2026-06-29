import { getAnalytics } from "@/app/actions/analytics";
import { Charts } from "@/components/dashboard/Charts";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function Kpi({ label, valor, color }: { label: string; valor: number; color: string }) {
  const n = Number(valor ?? 0); // guarda: data faltante no rompe toLocaleString
  return (
    <Card className="p-5" role="group" aria-label={`${label}: ${n.toLocaleString("es")}`}>
      <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${color}`}>
        {n.toLocaleString("es")}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}

export default async function Dashboard() {
  const data = await getAnalytics();

  return (
    <main className="flex-1 px-4 py-8 max-w-6xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Panel de situación</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Kpi label="Personas registradas" valor={data.personasTotal} color="text-primary" />
        <Kpi label="Insumos solicitados" valor={data.insumosTotal} color="text-[#14b8a6]" />
        <Kpi label="Hospitales" valor={data.hospitalesTotal} color="text-primary" />
        <Kpi label="Donaciones" valor={data.donacionesTotal} color="text-[#f59e0b]" />
      </div>

      <Charts data={data} />
    </main>
  );
}
