import { RegistroVoluntario } from "@/components/voluntarios/RegistroVoluntario";

export const dynamic = "force-dynamic";

// LANE V — Registro PÚBLICO de personal de salud voluntario (sin login).
// Replica el Google Form "PERSONAL DE SALUD VOLUNTARIO" de la Fundación Agua Verde:
// mismas 4 secciones y mismos campos; ahora los datos SÍ quedan en AviHelp
// (tabla `voluntarios`, estado 'pendiente' hasta que la logística apruebe).
// NOTA: esta ruta debe estar allow-listada en el middleware como pública.
export default function RegistroVoluntarioPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/5 to-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <RegistroVoluntario />
      </div>
    </main>
  );
}
