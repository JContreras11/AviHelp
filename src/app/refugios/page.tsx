import { Suspense } from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Refugios } from "@/components/refugios/Refugios";

export const metadata = { title: "Centros de atención | AviHelp" };
export const dynamic = "force-dynamic";

export default async function CentrosPage() {
  const a = createAdminClient();
  // Fuente ÚNICA: la tabla de instituciones (hospitales). Un "centro de atención" es
  // cualquier lugar con dirección que pueda recibir personas o ayuda: hospital, clínica,
  // refugio, etc. Mostramos TODOS los tipos (el usuario filtra).
  const { data: centros } = await a
    .from("hospitales")
    .select("id,nombre,tipo,ubicacion,gps_lat,gps_lng,contacto,responsable_recepcion_nombre,responsable_recepcion_contacto")
    .order("nombre");

  const ids = (centros ?? []).map((c: any) => c.id as string);
  const { data: needs } = ids.length
    ? await a.from("insumos")
        .select("id,hospital_id,nombre,cantidad,unidad,presentacion,area,prioridad,estado")
        .in("hospital_id", ids).in("estado", ["solicitado", "en_transito"]).order("prioridad")
    : { data: [] };

  return (
    <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Centros de atención</h1>
      <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
        Lugares que pueden recibir personas o ayuda durante la emergencia: hospitales, clínicas y
        refugios. Cada lugar puede pedir lo que necesita (medicinas, comida, agua, ropa…) y tú ayudas
        a llevarlo. Toca un lugar para ver su información, cómo llegar y qué hace falta.
      </p>

      <Suspense fallback={<div className="h-64 grid place-items-center text-sm text-muted-foreground">Cargando…</div>}>
        <Refugios centros={(centros ?? []) as any} needs={(needs ?? []) as any} />
      </Suspense>

      <p className="text-xs text-muted-foreground mt-6 border-t pt-3 max-w-2xl">
        Información de referencia para coordinar ayuda. Confirma cupos y horarios con el lugar antes de
        trasladar personas o llevar insumos.
      </p>
    </main>
  );
}
