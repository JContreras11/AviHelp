import Link from "next/link";
import { estadoPorZona, resumenGlobal, type ZonaEstado } from "@/app/actions/publico";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Estado de la emergencia | AviHelp",
  description: "Estado crítico por zona durante la emergencia. Solo conteos por severidad — sin datos sensibles.",
};
export const dynamic = "force-dynamic";

// Nivel de severidad de una zona: rojo (críticos) > naranja (altos) > verde (sin pendientes graves).
type Nivel = "critico" | "alto" | "estable";
function nivelDe(z: ZonaEstado): Nivel {
  if (z.criticos > 0) return "critico";
  if (z.altos > 0) return "alto";
  return "estable";
}

const ESTILO: Record<Nivel, { cls: string; punto: string; etiqueta: string }> = {
  critico: { cls: "border-red-500/40 bg-red-500/5", punto: "bg-red-500", etiqueta: "Crítico" },
  alto: { cls: "border-amber-500/40 bg-amber-500/5", punto: "bg-amber-500", etiqueta: "Alto" },
  estable: { cls: "border-emerald-500/30 bg-emerald-500/5", punto: "bg-emerald-500", etiqueta: "Estable" },
};

export default async function EstadoPublicoPage() {
  const [zonas, resumen] = await Promise.all([estadoPorZona(), resumenGlobal()]);

  return (
    <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>

      <header className="mt-2 mb-5">
        <p className="text-3xl mb-1">🚨</p>
        <h1 className="text-2xl font-bold leading-tight">Estado de la emergencia</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Situación crítica por zona, en vivo. Mostramos solo cuántas necesidades urgentes hay en cada
          zona y qué tan graves son. No se muestran datos de personas, ni qué pidió cada hospital, ni
          contactos: los detalles se gestionan directamente con los centros de acopio.
        </p>
      </header>

      {/* Resumen global */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Card size="sm"><CardContent className="py-1">
          <p className="text-2xl font-bold text-red-600">{resumen.criticos}</p>
          <p className="text-xs text-muted-foreground">Necesidades críticas</p>
        </CardContent></Card>
        <Card size="sm"><CardContent className="py-1">
          <p className="text-2xl font-bold text-amber-600">{resumen.altos}</p>
          <p className="text-xs text-muted-foreground">Necesidades altas</p>
        </CardContent></Card>
        <Card size="sm"><CardContent className="py-1">
          <p className="text-2xl font-bold text-emerald-600">{resumen.cubiertos}</p>
          <p className="text-xs text-muted-foreground">Ya cubiertas</p>
        </CardContent></Card>
        <Card size="sm"><CardContent className="py-1">
          <p className="text-2xl font-bold">{resumen.zonas}</p>
          <p className="text-xs text-muted-foreground">Zonas con actividad</p>
        </CardContent></Card>
      </section>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
        <span className="font-medium text-foreground">Severidad:</span>
        {(["critico", "alto", "estable"] as Nivel[]).map((n) => (
          <span key={n} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-full ${ESTILO[n].punto}`} />
            {ESTILO[n].etiqueta}
          </span>
        ))}
      </div>

      {/* Lista de zonas (críticas primero) */}
      {zonas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No hay actividad registrada por ahora.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {zonas.map((z) => {
            const nivel = nivelDe(z);
            const e = ESTILO[nivel];
            return (
              <li key={z.zona}>
                <Card className={`border ${e.cls}`}>
                  <CardContent className="flex items-center gap-3 py-1">
                    <span className={`shrink-0 size-3 rounded-full ${e.punto}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight truncate">{z.zona}</p>
                      <p className="text-xs text-muted-foreground">
                        {z.hospitales} {z.hospitales === 1 ? "institución" : "instituciones"} con actividad
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {z.criticos > 0 && (
                        <Badge variant="destructive" className="tabular-nums">{z.criticos} críticas</Badge>
                      )}
                      {z.altos > 0 && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 tabular-nums">{z.altos} altas</Badge>
                      )}
                      {z.criticos === 0 && z.altos === 0 && (
                        <Badge variant="outline">Sin pendientes graves</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground mt-6 border-t pt-3 max-w-2xl">
        Información agregada de referencia. Para coordinar una donación o conocer necesidades
        específicas, los detalles se gestionan con los centros de acopio y aliados. AviHelp — puente de
        comunicación en la emergencia.
      </p>
    </main>
  );
}
