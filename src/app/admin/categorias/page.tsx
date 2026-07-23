import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarCategorias } from "@/app/actions/catalogo";
import { Categorias } from "@/components/admin/Categorias";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  if (!(await getScope()).admin) redirect("/");

  const categorias = await listarCategorias();

  return (
    <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Categorías</h1>
      <p className="text-sm text-muted-foreground mb-6">Taxonomía de insumos y donaciones. Solo administradores.</p>
      <Categorias categorias={categorias} />
    </main>
  );
}
