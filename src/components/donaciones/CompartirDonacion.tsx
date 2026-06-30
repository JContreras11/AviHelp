"use client";

import { useState } from "react";
import { toast } from "sonner";
import { compartirEnlace, invitacionDonacion } from "@/lib/share";

// Botón de compartir el enlace de estado de una donación (Web Share API + fallback copiar).
export function CompartirDonacion({ codigo, className = "" }: { codigo: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/donaciones/${codigo}` : `https://avihelp.app/donaciones/${codigo}`;
    const r = await compartirEnlace({ title: `Donación ${codigo} — AviHelp`, text: invitacionDonacion(), url });
    if (r === "copied") {
      setCopiado(true);
      toast.success("Mensaje y enlace copiados");
      setTimeout(() => setCopiado(false), 2000);
    } else if (r === "error") {
      toast.error("No se pudo copiar el enlace.");
    }
  }

  return (
    <button type="button" onClick={compartir}
      className={`text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted ${className}`}>
      {copiado ? "✓ Enlace copiado" : "🔗 Compartir esta donación"}
    </button>
  );
}
