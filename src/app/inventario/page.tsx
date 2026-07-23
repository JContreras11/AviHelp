import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarInventario, listarCategoriasInventario, listarCentrosInventario } from "@/app/actions/inventario";
import { Inventario } from "@/components/inventario/Inventario";

export const metadata = { title: "Inventario de stock | AviHelp" };
export const dynamic = "force-dynamic";

// STOCK físico en bodega/centro de acopio (distinto de las NECESIDADES de los hospitales).
// Acceso restringido: solo admin o logística (miembros de algún centro de acopio).
export default async function InventarioPage() {
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0) redirect("/");

  const [items, categorias, centros] = await Promise.all([
    listarInventario(),
    listarCategoriasInventario(),
    listarCentrosInventario(),
  ]);

  return (
    <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Inventario de stock</h1>
      <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
        Lo que hay físicamente en bodega y se puede entregar. Distinto de las necesidades de los
        hospitales: aquí registras el stock real, su estatus y su vencimiento.
      </p>

      <Inventario items={items as any} categorias={categorias} centros={centros} />
    </main>
  );
}
