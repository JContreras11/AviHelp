import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarCuentas, listarGastos, listarCategorias } from "@/app/actions/finanzas";
import { Finanzas } from "@/components/finanzas/Finanzas";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  // Área RESTRINGIDA (dinero): solo admin o logística (miembro de algún centro).
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0) redirect("/");

  const [cuentas, movimientos, categorias] = await Promise.all([
    listarCuentas(),
    listarGastos(),
    listarCategorias(),
  ]);

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Gastos y cuentas</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cuentas bancarias (VES/USD), ingresos y egresos. Área restringida (admin / logística).
      </p>
      <Finanzas cuentas={cuentas} movimientos={movimientos} categorias={categorias} />
    </main>
  );
}
