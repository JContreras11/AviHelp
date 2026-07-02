"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarEnAcopio, despacharAHospital } from "@/app/actions/entregas";
import { Button } from "@/components/ui/button";

type Item = {
  id: string; codigo: string; estado: string; cantidad: number | null; area: string | null;
  entrega_nombre: string | null; entrega_telefono: string | null; siguiente: "recibir_en_acopio" | "despachar";
  hospital?: { nombre: string | null } | null; refugio?: { nombre: string | null } | null;
  insumos?: { nombre: string | null } | null; ofertas?: { descripcion: string | null } | null;
};

const ETIQUETA: Record<string, string> = {
  registrada: "por llegar", en_camino_acopio: "en camino al acopio", en_acopio: "en el acopio",
};

// Bandeja del CENTRO DE ACOPIO: marca la llegada de una donación y la despacha al hospital.
export function AcopioInbox({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Record<string, string>>({});

  const accion = (it: Item) => start(async () => {
    const r = it.siguiente === "despachar" ? await despacharAHospital(it.codigo) : await marcarEnAcopio(it.codigo);
    if (r.ok) router.refresh();
    else setMsg((m) => ({ ...m, [it.id]: r.error ?? "No se pudo." }));
  });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📦 En tu centro de acopio ({items.length})</h2>
        <span className="text-xs text-muted-foreground">Marca la llegada y despacha al hospital</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-xl border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium truncate">
                {it.insumos?.nombre ?? it.ofertas?.descripcion ?? "Donación"}{it.cantidad ? ` · ${it.cantidad}` : ""}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {it.hospital?.nombre ? `→ ${it.hospital.nombre}` : "sin hospital"}
                {it.area ? ` · ${it.area}` : ""}{it.entrega_nombre ? ` · de ${it.entrega_nombre}` : ""}
                {" · "}<span className="font-mono">{it.codigo}</span>
              </p>
              {msg[it.id] && <p className="text-xs text-red-600 mt-0.5">{msg[it.id]}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold rounded px-2 py-1 bg-purple-100 text-purple-700">{ETIQUETA[it.estado] ?? it.estado}</span>
              <Button size="sm" disabled={pending} onClick={() => accion(it)}>
                {it.siguiente === "despachar" ? "🚚 Despachar" : "📦 Marcar llegada"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
