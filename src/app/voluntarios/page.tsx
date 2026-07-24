import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import { listarComunidadVoluntarios, listarVoluntarios } from "@/app/actions/voluntarios";
import { listarCentros } from "@/app/actions/listas";
import { Voluntarios } from "@/components/voluntarios/Voluntarios";

export const dynamic = "force-dynamic";

// LANE V — Gestión de VOLUNTARIOS. Acceso: admin o miembro de centro de acopio.
//   • ADMIN: ve el pool de "voluntarios postulados" (pendientes), aprueba y agenda turnos,
//     además de la comunidad de aprobados.
//   • NO-ADMIN (ONG / centro): SOLO ve la "comunidad de voluntarios" (aprobados); no ve
//     ni aprueba el pool de solicitudes.
export default async function VoluntariosPage() {
  const sc = await getScope();
  if (!sc.admin && sc.centroIds.length === 0) redirect("/");

  const [voluntarios, centros] = await Promise.all([
    sc.admin ? listarVoluntarios() : listarComunidadVoluntarios(),
    listarCentros(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">🤝 Voluntarios</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        {sc.admin
          ? "Revisa las postulaciones del formulario público, aprueba los registros pendientes y agenda turnos. La comunidad reúne a los voluntarios ya aprobados."
          : "Comunidad de voluntarios aprobados, con sus áreas y disponibilidad."}
      </p>
      <Voluntarios
        voluntariosInicial={voluntarios}
        centros={(centros as any[]).map((c) => ({ id: c.id, nombre: c.nombre, zona: c.zona ?? null }))}
        esAdmin={sc.admin}
      />
    </main>
  );
}
