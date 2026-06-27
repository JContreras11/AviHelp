import { createAdminClient } from "@/lib/supabase/server";
import { Captura } from "@/components/Captura";
import { Logo } from "@/components/Brand";
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
    <main className="flex-1 px-4 py-10 sm:py-14 bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="max-w-2xl mx-auto text-center mb-10 flex flex-col items-center">
        <Logo size={88} />
        <h1 className="mt-4 text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-[#5eead4] bg-clip-text text-transparent">
          Soy Avi
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Tómame una foto o háblame. Registro personas e insumos en la emergencia, al instante.
        </p>
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
