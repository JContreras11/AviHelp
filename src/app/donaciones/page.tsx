import Link from "next/link";
import { getSesion } from "@/lib/supabase/server";
import { misOfertas } from "@/app/actions/ofertas";
import { listarEntregasPorRecibir } from "@/app/actions/entregas";
import { MisDonaciones } from "@/components/MisDonaciones";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Módulo unificado de Donaciones: donar + mis donaciones + (personal) recepción.
export default async function DonacionesHub() {
  const sesion = await getSesion();
  const [ofertas, porRecibir] = await Promise.all([
    sesion ? misOfertas() : Promise.resolve([]),
    sesion ? listarEntregasPorRecibir() : Promise.resolve([]),
  ]);

  return (
    <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
        <h1 className="text-2xl font-bold mt-1">Donaciones</h1>
        <p className="text-sm text-muted-foreground">Dona insumos o tu tiempo, y sigue cada entrega hasta que llega a manos del hospital.</p>
      </header>

      <section className="rounded-2xl border bg-gradient-to-r from-primary/10 to-transparent p-4 flex items-center gap-3">
        <span className="text-3xl shrink-0">💜</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">¿Tienes algo para donar?</p>
          <p className="text-sm text-muted-foreground">Foto, audio o texto — Avi lo entiende en segundos.</p>
        </div>
        <Link href="/donaciones/crear"><Button>Donar ahora</Button></Link>
      </section>

      {porRecibir.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">📥 Por recibir ({porRecibir.length})</h2>
            <span className="text-xs text-muted-foreground">Confirma la recepción en tu centro</span>
          </div>
          <div className="flex flex-col gap-2">
            {porRecibir.slice(0, 8).map((e: any) => (
              <Link key={e.id} href={`/donaciones/recibir/${e.codigo}`} className="rounded-xl border p-3 flex items-center justify-between gap-2 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block font-medium truncate">{e.ofertas?.descripcion ?? "Donación"}{e.cantidad ? ` · ${e.cantidad}` : ""}</span>
                  <span className="block text-xs text-muted-foreground">
                    {e.insumos?.nombre ? `Para: ${e.insumos.nombre}` : "Sin necesidad asignada"}
                    {e.area ? ` · ${e.area}` : ""}{e.entrega_nombre ? ` · de ${e.entrega_nombre}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold rounded px-2 py-1 bg-amber-100 text-amber-700">{e.estado === "en_transito" ? "en camino" : "pendiente"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Mis donaciones</h2>
        {sesion ? (
          <MisDonaciones inicial={ofertas as any} />
        ) : (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary underline">Inicia sesión</Link> para ver el historial de tus donaciones y su estado.
          </div>
        )}
      </section>
    </main>
  );
}
