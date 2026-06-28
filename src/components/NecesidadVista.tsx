"use client";

import { useRouter } from "next/navigation";
import { InsumoDialog } from "@/components/datos/Detalle";

// Vista dedicada de una Necesidad (insumo) para deep-link de notificaciones.
// Reusa el diálogo de insumo (conciliación, donaciones, tracking) como detalle.
export function NecesidadVista({ id }: { id: string }) {
  const router = useRouter();
  return <InsumoDialog id={id} onClose={() => router.push("/")} onChanged={() => {}} />;
}
