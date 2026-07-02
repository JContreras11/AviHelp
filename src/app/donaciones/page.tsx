import Link from "next/link";
import { getSesion } from "@/lib/supabase/server";
import { misOfertas } from "@/app/actions/ofertas";
import { listarEntregasPorRecibir, listarEntregasConfirmadas, listarEntregasAcopio, misCentros } from "@/app/actions/entregas";
import { MisDonaciones } from "@/components/MisDonaciones";
import { AcopioInbox } from "@/components/donaciones/AcopioInbox";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const RECIBIR_ETIQUETA: Record<string, string> = {
  registrada: "por llegar", en_camino_acopio: "en camino al acopio",
  en_acopio: "en el acopio", en_camino_hospital: "en camino al hospital",
};

// Módulo unificado de Donaciones: donar + mis donaciones + (acopio) despacho + (hospital) recepción.
export default async function DonacionesHub() {
  const sesion = await getSesion();
  // Cada fetch tolera fallo (una query rota NO debe tumbar toda la página → evita "server error").
  const [ofertas, acopio, centros, porRecibir, confirmadas] = await Promise.all([
    sesion ? misOfertas().catch(() => []) : Promise.resolve([]),
    sesion ? listarEntregasAcopio().catch(() => []) : Promise.resolve([]),
    sesion ? misCentros().catch(() => []) : Promise.resolve([]),
    sesion ? listarEntregasPorRecibir().catch(() => []) : Promise.resolve([]),
    sesion ? listarEntregasConfirmadas().catch(() => []) : Promise.resolve([]),
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

      {acopio.length > 0 && <AcopioInbox items={acopio as any} centros={centros as any} />}

      {porRecibir.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">📥 Por recibir en el hospital ({porRecibir.length})</h2>
            <span className="text-xs text-muted-foreground">Confirma la recepción cuando llegue</span>
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
                <span className="shrink-0 text-xs font-semibold rounded px-2 py-1 bg-amber-100 text-amber-700">{RECIBIR_ETIQUETA[e.estado] ?? e.estado}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {confirmadas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">✅ Recibidas en mi centro ({confirmadas.length})</h2>
          <div className="flex flex-col gap-2">
            {confirmadas.slice(0, 10).map((e: any) => (
              <Link key={e.id} href={`/donaciones/${e.codigo}`} className="rounded-xl border p-3 flex items-center gap-3 hover:bg-muted">
                {e.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.foto_url} alt="" className="size-12 rounded-lg object-cover shrink-0 border" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">{e.ofertas?.descripcion ?? "Donación"}{e.cantidad ? ` · ${e.cantidad}` : ""}</span>
                  <span className="block text-xs text-muted-foreground">
                    {e.insumos?.nombre ? `${e.insumos.nombre} · ` : ""}{e.recibido_por_nombre ? `por ${e.recibido_por_nombre}` : ""}
                    {e.recibido_at ? ` · ${new Date(e.recibido_at).toLocaleDateString("es-VE")}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.codigo}</span>
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
