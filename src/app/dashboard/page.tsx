import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function conteo(tabla: string, filtros?: Record<string, string>) {
  const supabase = createAdminClient();
  let q = supabase.from(tabla).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filtros ?? {})) q = q.eq(k, v);
  return (await q).count ?? 0;
}

function Kpi({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <Card className="p-5">
      <div className={`text-3xl font-bold ${color}`}>{valor}</div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}

export default async function Dashboard() {
  const [personas, desaparecidos, heridos, detenidos, fallecidos, insumos, transito, hospitales] =
    await Promise.all([
      conteo("personas"),
      conteo("personas", { estado_salud: "desaparecido" }),
      conteo("personas", { estado_salud: "herido" }),
      conteo("personas", { estado_salud: "detenido" }),
      conteo("personas", { estado_salud: "fallecido" }),
      conteo("insumos"),
      conteo("insumos", { estado: "en_transito" }),
      conteo("hospitales"),
    ]);

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Panel de situación</h1>

      <h2 className="text-sm font-semibold text-muted-foreground mb-2">Personas</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <Kpi label="Registradas" valor={personas} color="text-primary" />
        <Kpi label="Desaparecidos" valor={desaparecidos} color="text-red-600" />
        <Kpi label="Heridos" valor={heridos} color="text-amber-600" />
        <Kpi label="Detenidos" valor={detenidos} color="text-purple-600" />
        <Kpi label="Fallecidos" valor={fallecidos} color="text-gray-600" />
      </div>

      <h2 className="text-sm font-semibold text-muted-foreground mb-2">Insumos y hospitales</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="Insumos solicitados" valor={insumos} color="text-primary" />
        <Kpi label="En tránsito" valor={transito} color="text-[#0d9488]" />
        <Kpi label="Hospitales" valor={hospitales} color="text-primary" />
      </div>
    </main>
  );
}
