import Link from "next/link";
import { getScope, createAdminClient } from "@/lib/supabase/server";
import { Refugios } from "@/components/refugios/Refugios";

export const metadata = { title: "Refugios — La Guaira | AviHelp" };
export const dynamic = "force-dynamic";

export default async function RefugiosPage() {
  const a = createAdminClient();
  const sc = await getScope();
  const { data: refugios } = await a.from("hospitales").select("id,nombre,tipo,ubicacion,gps_lat,gps_lng").eq("tipo", "refugio").order("nombre");
  const ids = (refugios ?? []).map((r: any) => r.id as string);
  const { data: needs } = ids.length
    ? await a.from("insumos").select("id,hospital_id,nombre,cantidad,unidad,area,prioridad,estado")
        .in("hospital_id", ids).in("estado", ["solicitado", "en_transito"]).order("prioridad")
    : { data: [] };

  // Qué refugios gestiona el usuario (admin = todos).
  const gestiona = sc.admin ? "all" : ids.filter((id: string) => sc.hospitalIds.includes(id));

  return (
    <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Refugios en La Guaira</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Lugares que resguardan personas en la emergencia. Cada refugio puede solicitar lo que necesita (insumos, comida, agua, ropa…) y tú coordinas la entrega.
      </p>

      <Refugios refugios={refugios ?? []} needs={needs ?? []} gestiona={gestiona} />

      <p className="text-xs text-muted-foreground mt-6 border-t pt-3">
        Información de referencia para coordinar ayuda. Verifica disponibilidad y cupos con las autoridades del refugio antes de trasladar personas o insumos.
      </p>
    </main>
  );
}
