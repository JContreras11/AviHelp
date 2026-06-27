import { createAdminClient } from "@/lib/supabase/server";
import { Captura } from "@/components/Captura";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const ESTADO_COLOR: Record<string, string> = {
  herido: "bg-amber-100 text-amber-800",
  desaparecido: "bg-red-100 text-red-800",
  detenido: "bg-purple-100 text-purple-800",
  fallecido: "bg-gray-200 text-gray-800",
  vivo: "bg-green-100 text-green-800",
};

export default async function Home() {
  const supabase = createAdminClient();
  const [{ data: personas }, { data: insumos }] = await Promise.all([
    supabase.from("personas").select("*").order("updated_at", { ascending: false }).limit(12),
    supabase.from("insumos").select("*, hospitales(nombre)").order("created_at", { ascending: false }).limit(12),
  ]);

  return (
    <main className="flex-1 px-4 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight">AviHelp</h1>
        <p className="text-muted-foreground mt-2">
          Una foto o tu voz. La IA registra personas e insumos en la emergencia.
        </p>
        <a href="/chat" className="inline-block mt-3 text-sm text-primary underline">
          💬 Preguntar al asistente
        </a>
      </div>

      <Captura />

      <div className="max-w-2xl mx-auto mt-12 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold mb-3">Personas recientes</h2>
          <ul className="space-y-2">
            {(personas ?? []).map((p: any) => (
              <li key={p.id} className="text-sm border rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.nombre}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${ESTADO_COLOR[p.estado_salud] ?? "bg-muted"}`}>
                    {p.estado_salud}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {[p.edad && `${p.edad} años`, p.sexo, p.ubicacion, p.cedula].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
            {!personas?.length && <p className="text-sm text-muted-foreground">Aún no hay registros.</p>}
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-3">Insumos solicitados</h2>
          <ul className="space-y-2">
            {(insumos ?? []).map((i: any) => (
              <li key={i.id} className="text-sm border rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{i.nombre}</span>
                  <Badge variant="outline">{i.estado}</Badge>
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {[i.cantidad && `${i.cantidad} ${i.unidad ?? ""}`, i.hospitales?.nombre, i.prioridad]
                    .filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
            {!insumos?.length && <p className="text-sm text-muted-foreground">Aún no hay insumos.</p>}
          </ul>
        </section>
      </div>
    </main>
  );
}
