import { getAnalytics } from "@/app/actions/analytics";
import { PanelInsumos } from "@/components/dashboard/PanelInsumos";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const data = await getAnalytics();

  return (
    <main className="flex-1 px-4 py-8 max-w-7xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Panel de necesidades</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Qué insumos hacen falta, dónde y con qué urgencia — en tiempo real. Toca una institución para
        ver y atender sus pedidos.
      </p>
      <PanelInsumos data={data} />
    </main>
  );
}
