import { getSesion } from "@/lib/supabase/server";
import { listarCentrosEntrega } from "@/app/actions/ofertas";
import OfrecerForm from "./OfrecerForm";

export const dynamic = "force-dynamic";

// Server wrapper: detecta la sesión (sin parpadeo) y lista los centros de entrega.
// Logueado -> no se piden nombre/teléfono (el servidor los toma del perfil).
export default async function Ofrecer() {
  const [sesion, centros] = await Promise.all([getSesion(), listarCentrosEntrega()]);
  return <OfrecerForm autenticado={!!sesion} nombre={sesion?.nombre ?? null} centros={centros} />;
}
