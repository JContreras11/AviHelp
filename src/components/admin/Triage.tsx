"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aprobarMatch, rechazarMatch } from "@/app/actions/match";

const TIPO_LABEL: Record<string, string> = { insumo_fisico: "📦 Insumo", personal_humano: "🩺 Personal" };

export function Triage({ inicial }: { inicial: any[] }) {
  const [rows, setRows] = useState(inicial);
  const [busy, setBusy] = useState<string | null>(null);

  async function actuar(id: string, accion: "aprobar" | "rechazar") {
    setBusy(id);
    const r = accion === "aprobar" ? await aprobarMatch(id) : await rechazarMatch(id);
    setBusy(null);
    if (!r.ok) { toast.error((r as any).error); return; }
    setRows((xs) => xs.filter((x) => x.id !== id));
    toast.success(accion === "aprobar" ? "Emparejamiento aprobado — oferta reservada y partes notificadas." : "Sugerencia descartada.");
  }

  if (rows.length === 0) return <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No hay emparejamientos pendientes.</p>;

  return (
    <div className="flex flex-col gap-3">
      {rows.map((m) => {
        const of = m.ofertas ?? {}, hosp = m.hospitales ?? {}, ins = m.insumos ?? null;
        return (
          <div key={m.id} className="rounded-2xl border p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{TIPO_LABEL[of.tipo] ?? "Oferta"}: {of.descripcion}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {of.cantidad ? `Cantidad ${of.cantidad} · ` : ""}{of.ubicacion_actual ? `${of.ubicacion_actual} · ` : ""}
                  {[of.contacto_nombre, of.contacto_telefono].filter(Boolean).join(" · ") || "sin contacto"}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="font-medium">→ Sugerencia IA: {hosp.nombre ?? "hospital"}{m.cantidad_sugerida ? ` · ${m.cantidad_sugerida} und.` : ""}</p>
              {ins?.nombre && <p className="text-xs text-muted-foreground">Cubre: {ins.nombre}{ins.area ? ` (${ins.area})` : ""}</p>}
              {m.razon && <p className="text-sm mt-1">🤖 {m.razon}</p>}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy === m.id} onClick={() => actuar(m.id, "aprobar")}>✅ Aprobar emparejamiento</Button>
              <Button variant="outline" disabled={busy === m.id} onClick={() => actuar(m.id, "rechazar")}>Rechazar</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
