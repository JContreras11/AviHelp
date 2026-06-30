import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { listarMisSolicitudes, hospitalesGestionables, necesidadesAgrupables, cargasCompartibles } from "@/app/actions/solicitudes";
import { CrearSolicitud } from "@/components/solicitud/CrearSolicitud";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { label: string; cls: string }> = {
  abierta: { label: "Abierta", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  en_progreso: { label: "En progreso", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" },
  cubierta: { label: "Cubierta", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  cerrada: { label: "Cerrada", cls: "bg-muted text-muted-foreground" },
};

export default async function SolicitudesPage() {
  const s = await getSesion();
  if (!s) redirect("/login?next=/solicitudes");

  const [mias, hospitales, agrupables, cargas] = await Promise.all([
    listarMisSolicitudes(), hospitalesGestionables(), necesidadesAgrupables(), cargasCompartibles(),
  ]);

  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Solicitudes</h1>
        <p className="text-sm text-muted-foreground mt-1">Crea un paquete de necesidades con enlace público para difundir en redes y chats de ONG.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Nueva solicitud</h2>
        <CrearSolicitud hospitales={hospitales} agrupables={agrupables} cargas={cargas} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Mis solicitudes ({mias.length})</h2>
        {mias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has creado solicitudes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mias.map((m: any) => {
              const est = ESTADO[m.estado] ?? ESTADO.abierta;
              return (
                <li key={m.id}>
                  <Link href={`/solicitud/${m.slug}`} className="block rounded-2xl border bg-card p-3.5 hover:bg-muted/40 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight truncate">{m.titulo}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {m.hospitales?.nombre ? `🏥 ${m.hospitales.nombre} · ` : ""}
                          {m.cubiertas}/{m.total} cubiertas
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${est.cls}`}>{est.label}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
