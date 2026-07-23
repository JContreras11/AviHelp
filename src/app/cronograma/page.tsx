import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarCronograma } from "@/app/actions/voluntarios";
import { Cronograma } from "@/components/cronograma/Cronograma";

export const dynamic = "force-dynamic";

// LANE V — CRONOGRAMA MÉDICO: la grilla semanal del Excel real de la fundación
// (Días | Nombre | Especialidad | Turno), leída de `agenda` (tipo='voluntario').
// Imprimible. Lectura para personal interno: logística Y hospitales.
export default async function CronogramaPage() {
  const sc = await getScope();
  const interno = sc.admin || sc.centroIds.length > 0 || sc.hospitalIds.length > 0;
  if (!interno) redirect("/");

  // Semana actual: desde el lunes, 7 días.
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - ((desde.getDay() + 6) % 7)); // lunes
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + 7);

  const turnos = await listarCronograma(desde.toISOString(), hasta.toISOString());
  const esLogistica = sc.admin || sc.centroIds.length > 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <Cronograma
        turnosInicial={turnos}
        desdeInicial={desde.toISOString()}
        esLogistica={esLogistica}
      />
    </main>
  );
}
