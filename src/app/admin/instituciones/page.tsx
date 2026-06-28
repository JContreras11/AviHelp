import { redirect } from "next/navigation";
import { getSesion, createAdminClient } from "@/lib/supabase/server";
import { Instituciones } from "@/components/admin/Instituciones";

export const dynamic = "force-dynamic";

export default async function InstitucionesPage() {
  const s = await getSesion();
  if (s?.rol !== "admin") redirect("/");

  const a = createAdminClient();
  const [{ data: hospitales }, { data: centros }] = await Promise.all([
    a.from("hospitales").select("*").order("nombre"),
    a.from("centros_acopio").select("*").order("nombre"),
  ]);

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Instituciones</h1>
      <p className="text-sm text-muted-foreground mb-6">Hospitales, clínicas y centros de acopio. Solo administradores.</p>
      <Instituciones hospitales={hospitales ?? []} centros={centros ?? []} />
    </main>
  );
}
