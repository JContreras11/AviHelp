import { redirect } from "next/navigation";
import { getScope, createAdminClient } from "@/lib/supabase/server";
import { listarCategorias } from "@/app/actions/catalogo";
import { CheckinFlow } from "@/components/checkin/CheckinFlow";

export const dynamic = "force-dynamic";

// LANE D — Check-in / Recepción de donaciones. Acceso RESTRINGIDO a logística/admin.
export default async function CheckinPage() {
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0) redirect("/");

  const a = createAdminClient();
  const cats = await listarCategorias();
  const categorias = (cats ?? [])
    .filter((c: any) => c.activo !== false)
    .map((c: any) => ({ id: c.id, nombre: c.nombre, orden: c.orden ?? 0 }))
    .sort((x: any, y: any) => x.orden - y.orden || x.nombre.localeCompare(y.nombre));

  // Centros de acopio que el usuario puede usar como destino (admin: todos).
  let centrosQ = a.from("centros_acopio").select("id, nombre").order("nombre");
  if (!sc.admin) centrosQ = centrosQ.in("id", sc.centroIds);
  const { data: centrosData } = await centrosQ;
  const centros = (centrosData ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre }));

  return (
    <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Recepción de donaciones</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Registra lo que llega al centro de acopio: donante, categorías y el detalle de cada ítem recibido.
      </p>
      <CheckinFlow categorias={categorias} centros={centros} esAdmin={sc.admin} />
    </main>
  );
}
