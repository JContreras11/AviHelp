import { RegistroVoluntario } from "@/components/voluntarios/RegistroVoluntario";
import { listarOrganizacionesVoluntario } from "@/app/actions/voluntarios";

export const dynamic = "force-dynamic";

// LANE V — Registro PÚBLICO de voluntariado (sin login). El voluntariado es genérico
// (no solo personal de salud): área(s) de interés, disponibilidad por día y la
// organización a la que se presta servicio. Los datos quedan en la tabla `voluntarios`
// con estado 'pendiente' hasta que un administrador los apruebe.
// NOTA: esta ruta debe estar allow-listada en el middleware como pública.
export default async function RegistroVoluntarioPage() {
  const organizaciones = await listarOrganizacionesVoluntario();
  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/5 to-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <RegistroVoluntario organizaciones={organizaciones} />
      </div>
    </main>
  );
}
