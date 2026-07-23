import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarVoluntarios } from "@/app/actions/voluntarios";
import { listarCentros } from "@/app/actions/listas";
import { Voluntarios } from "@/components/voluntarios/Voluntarios";

export const dynamic = "force-dynamic";

// LANE V — ROSTER de voluntarios (personal de salud). Solo LOGÍSTICA
// (admin o miembro de centro de acopio): revisa postulaciones del formulario
// público, aprueba (pendiente → activo) y agenda turnos del cronograma médico.
export default async function VoluntariosPage() {
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0) redirect("/");

  const [voluntarios, centros] = await Promise.all([
    listarVoluntarios(),
    listarCentros(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">🩺 Voluntarios</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Personal de salud postulado desde el formulario público. Aprueba los registros
        pendientes y agenda sus turnos en el cronograma médico.
      </p>
      <Voluntarios
        voluntariosInicial={voluntarios}
        centros={(centros as any[]).map((c) => ({ id: c.id, nombre: c.nombre, zona: c.zona ?? null }))}
      />
    </main>
  );
}
