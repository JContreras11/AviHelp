import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarAgenda } from "@/app/actions/agenda";
import { listarCamioneros, listarCentrosAcopio, miCamionero } from "@/app/actions/camiones";
import { Calendario } from "@/components/calendario/Calendario";

export const dynamic = "force-dynamic";

// CALENDARIO / AGENDA reusable: turnos de VOLUNTARIOS en centros de apoyo +
// DISPONIBILIDAD de camioneros — una sola tabla `agenda`, una sola vista.
// Acceso: logística (admin / centro de acopio). EXCEPCIÓN: un camionero entra
// a gestionar su propia disponibilidad.
export default async function CalendarioPage() {
  const sc = await getScope();
  const cam = await miCamionero();
  const esLogistica = sc.admin || sc.centroIds.length > 0;
  if (!esLogistica && !cam) redirect("/");

  // Rango inicial: desde el lunes de esta semana, 2 semanas hacia adelante.
  const hoy = new Date();
  const desde = new Date(hoy); desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - ((desde.getDay() + 6) % 7)); // lunes
  const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 14);

  const [turnos, camioneros, centros] = await Promise.all([
    listarAgenda({ desde: desde.toISOString(), hasta: hasta.toISOString() }),
    esLogistica ? listarCamioneros() : Promise.resolve([]),
    esLogistica ? listarCentrosAcopio() : Promise.resolve([]),
  ]);

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">📅 Calendario</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Una sola agenda: turnos de voluntarios en los centros de apoyo (quién está presente y
        cuándo) y disponibilidad de camioneros para el despacho.
      </p>
      <Calendario
        esLogistica={esLogistica}
        miCamioneroId={cam?.id ?? null}
        turnosInicial={turnos}
        camioneros={camioneros as any[]}
        centros={centros}
        desdeInicial={desde.toISOString()}
      />
    </main>
  );
}
