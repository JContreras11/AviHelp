import { getSesion } from "@/lib/supabase/server";
import { listarCentrosEntrega } from "@/app/actions/ofertas";
import DonacionWizard from "./DonacionWizard";

export const dynamic = "force-dynamic";

// Flujo de donación paso a paso (una decisión por vista). Migra el antiguo /ofrecer.
// Logueado -> no pide nombre/teléfono (servidor los toma del perfil).
export default async function CrearDonacion() {
  const [sesion, centros] = await Promise.all([getSesion(), listarCentrosEntrega()]);
  return <DonacionWizard autenticado={!!sesion} nombre={sesion?.nombre ?? null} centros={centros} />;
}
