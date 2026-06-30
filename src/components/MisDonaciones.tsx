"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cancelarOferta } from "@/app/actions/ofertas";
import { Button } from "@/components/ui/button";

type Entrega = { codigo: string; estado: string; recibido_at: string | null };
type Oferta = {
  id: string; codigo?: string | null; tipo: string; descripcion: string; cantidad: number | null;
  estatus: "disponible" | "reservado" | "entregado" | "cancelado"; created_at: string;
  hospitales?: { nombre: string | null; ubicacion: string | null } | null;
  entregas?: Entrega[] | null;
};

const ESTADO: Record<string, { label: string; cls: string }> = {
  disponible: { label: "Disponible", cls: "bg-sky-100 text-sky-700" },
  reservado:  { label: "Reservado", cls: "bg-amber-100 text-amber-700" },
  entregado:  { label: "Entregado", cls: "bg-emerald-100 text-emerald-700" },
  cancelado:  { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

export function MisDonaciones({ inicial }: { inicial: Oferta[] }) {
  const [ofertas, setOfertas] = useState<Oferta[]>(inicial);
  const [cancelando, setCancelando] = useState<string | null>(null);

  async function cancelar(id: string) {
    setCancelando(id);
    const r = await cancelarOferta(id);
    setCancelando(null);
    if (!r.ok) { toast.error(r.error); return; }
    // Actualiza el estado local (sin router.refresh): la lista refleja el cambio al instante.
    setOfertas((prev) => prev.map((o) => (o.id === id ? { ...o, estatus: "cancelado" } : o)));
    toast.success("Donación cancelada.");
  }

  if (!ofertas.length) {
    return (
      <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
        Aún no has registrado donaciones.{" "}
        <Link href="/donaciones/crear" className="text-primary underline">Donar 💜</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {ofertas.map((o) => {
        const e = ESTADO[o.estatus] ?? ESTADO.disponible;
        const cancelable = o.estatus !== "entregado" && o.estatus !== "cancelado";
        return (
          <div key={o.id} className="rounded-xl border p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium min-w-0">
                {o.tipo === "personal_humano" ? "🩺 " : "📦 "}
                <span className="capitalize">{o.descripcion}</span>
                {o.cantidad ? <span className="text-muted-foreground"> · {o.cantidad} und.</span> : null}
              </p>
              <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${e.cls}`}>{e.label}</span>
            </div>
            {o.hospitales?.nombre && (
              <p className="text-sm text-muted-foreground">📦 Entrega en: {o.hospitales.nombre}
                {o.hospitales.ubicacion ? ` — ${o.hospitales.ubicacion}` : ""}</p>
            )}
            {(() => {
              const ent = o.entregas?.[0];
              const codigo = ent?.codigo ?? o.codigo;
              if (!codigo) return null;
              return (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Link href={`/donaciones/${codigo}`} className="text-primary underline">
                    🔗 Seguir entrega · <span className="font-mono">{codigo}</span>
                  </Link>
                  {ent?.estado === "recibido" && <span className="text-emerald-600 font-medium">✅ recibida</span>}
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("es-VE")}</p>
            {cancelable && (
              <div>
                <Button variant="outline" size="sm" disabled={cancelando === o.id} onClick={() => cancelar(o.id)}>
                  {cancelando === o.id ? "Cancelando…" : "Cancelar"}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
