"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { estadoImpersonacion, dejarDeImpersonar } from "@/app/actions/impersonar";

// Barra fija cuando un admin está "viendo como" otro usuario.
export function ImpersonationBanner() {
  const router = useRouter();
  const [est, setEst] = useState<{ activo: boolean; nombre?: string; rol?: string }>({ activo: false });

  useEffect(() => { estadoImpersonacion().then(setEst); }, []);

  if (!est.activo) return null;

  async function salir() {
    await dejarDeImpersonar();
    router.refresh();
  }

  return (
    <div className="print:hidden sticky top-0 z-30 flex flex-wrap items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-sm font-medium text-black">
      <span>👁️ Viendo como <strong>{est.nombre}</strong> ({est.rol})</span>
      <button onClick={salir} className="rounded-md bg-black/15 px-2 py-0.5 text-xs font-semibold hover:bg-black/25">
        Volver a mi cuenta
      </button>
    </div>
  );
}
