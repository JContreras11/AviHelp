import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarReceptores } from "@/app/actions/receptores";
import { Receptores } from "@/components/despacho/Receptores";

export const metadata = { title: "Receptores y despacho | AviHelp" };
export const dynamic = "force-dynamic";

// Área RESTRINGIDA: admin o personal de logística (miembro de un centro de acopio).
export default async function DespachoPage() {
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0) redirect("/");

  const receptores = await listarReceptores();

  return (
    <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-6 flex flex-col gap-5">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
        <h1 className="text-2xl font-bold mt-2">Receptores y despacho</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Registra a los beneficiarios finales de la ayuda (comunidades, refugios, familias o
          instituciones) y asígnalos a una entrega por su código para dejar constancia de a quién
          se despachó. Busca por identificación fiscal para no duplicar.
        </p>
      </div>

      <Receptores inicial={receptores} />
    </main>
  );
}
