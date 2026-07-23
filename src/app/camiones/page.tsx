import { redirect } from "next/navigation";
import { getScope } from "@/lib/supabase/server";
import {
  esCamionero, listarCamiones, listarCamioneros, listarCentrosAcopio,
  listarEntregasAsignables, misEntregasCamionero,
} from "@/app/actions/camiones";
import { Camiones } from "@/components/camiones/Camiones";

export const dynamic = "force-dynamic";

// LOGÍSTICA DE TRANSPORTE: camiones + camioneros + asignación a entregas.
// Acceso restringido: logística (admin / miembro de centro de acopio).
// EXCEPCIÓN: un camionero (fila en `camioneros`) entra a ver SUS entregas asignadas.
export default async function CamionesPage() {
  const sc = await getScope();
  const soyCamionero = await esCamionero();
  const esLogistica = sc.admin || sc.centroIds.length > 0;
  if (!esLogistica && !soyCamionero) redirect("/");

  const [camiones, camioneros, centros, entregas, misEntregas] = await Promise.all([
    esLogistica ? listarCamiones() : Promise.resolve([]),
    esLogistica ? listarCamioneros() : Promise.resolve([]),
    esLogistica ? listarCentrosAcopio() : Promise.resolve([]),
    esLogistica ? listarEntregasAsignables() : Promise.resolve([]),
    soyCamionero ? misEntregasCamionero() : Promise.resolve([]),
  ]);

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">🚚 Camiones y camioneros</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Flota de despacho: capacidad de cada camión (lleno / con espacio), choferes y
        asignación de camión + camionero a cada entrega en curso.
      </p>
      <Camiones
        esLogistica={esLogistica}
        soyCamionero={soyCamionero}
        camiones={camiones as any[]}
        camioneros={camioneros as any[]}
        centros={centros}
        entregas={entregas as any[]}
        misEntregas={misEntregas as any[]}
      />
    </main>
  );
}
