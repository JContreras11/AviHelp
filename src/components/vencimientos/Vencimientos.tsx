"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ItemVencimiento, Urgencia } from "@/app/actions/vencimientos";

// Vista de ALERTAS DE VENCIMIENTO (cliente). Lista ordenada por caducidad, con badges de
// urgencia, días restantes, filtro por urgencia y CTA para priorizar el envío al hospital.
// Mobile-first: tarjetas apiladas en móvil, cómodas en desktop.

type Filtro = "todos" | Urgencia;

const URGENCIA_META: Record<Urgencia, { label: string; badge: string; ring: string }> = {
  vencido: {
    label: "Vencido",
    badge: "bg-destructive text-white dark:bg-destructive/80",
    ring: "ring-destructive/40",
  },
  critico: {
    label: "Crítico",
    badge: "bg-orange-500 text-white dark:bg-orange-500/80",
    ring: "ring-orange-500/40",
  },
  pronto: {
    label: "Pronto",
    badge: "bg-yellow-400 text-yellow-950 dark:bg-yellow-500/80 dark:text-yellow-950",
    ring: "ring-yellow-400/40",
  },
};

// "en 12 días" / "hoy" / "vencido hace 3 días".
function textoDias(dias: number): string {
  if (dias < 0) return `vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "vence hoy";
  return `en ${dias} día${dias === 1 ? "" : "s"}`;
}

function fechaCorta(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function Vencimientos({ items }: { items: ItemVencimiento[] }) {
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

  const conteos = React.useMemo(() => {
    const c: Record<Urgencia, number> = { vencido: 0, critico: 0, pronto: 0 };
    for (const it of items) c[it.urgencia]++;
    return c;
  }, [items]);

  const visibles = React.useMemo(
    () => (filtro === "todos" ? items : items.filter((i) => i.urgencia === filtro)),
    [items, filtro],
  );

  const filtros: { key: Filtro; label: string; n: number }[] = [
    { key: "todos", label: "Todos", n: items.length },
    { key: "vencido", label: "Vencidos", n: conteos.vencido },
    { key: "critico", label: "Críticos", n: conteos.critico },
    { key: "pronto", label: "Pronto", n: conteos.pronto },
  ];

  if (!items.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        ✅ No hay medicamentos ni insumos por vencer en los próximos 60 días.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros por urgencia (chips) */}
      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filtro === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
            <span className={cn("tabular-nums", filtro === f.key ? "opacity-90" : "opacity-70")}>{f.n}</span>
          </button>
        ))}
      </div>

      {/* Lista ordenada por caducidad */}
      <ul className="space-y-3">
        {visibles.map((it) => {
          const meta = URGENCIA_META[it.urgencia];
          return (
            <li key={it.id}>
              <Card className={cn("p-4 ring-1", meta.ring)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {it.origen === "inventario" ? "En bodega" : "Donación"}
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-medium leading-snug break-words">{it.nombre}</h3>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {it.cantidad != null && <span>{it.cantidad} und.</span>}
                      {it.categoria && <span>{it.categoria}</span>}
                      {it.ubicacion && <span>📍 {it.ubicacion}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        it.urgencia === "vencido"
                          ? "text-destructive"
                          : it.urgencia === "critico"
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-yellow-600 dark:text-yellow-400",
                      )}
                    >
                      {textoDias(it.dias)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{fechaCorta(it.vencimiento)}</div>
                  </div>
                </div>
                <p className="mt-3 text-xs font-medium text-primary">→ Priorizar envío a hospital antes de que venza</p>
              </Card>
            </li>
          );
        })}
      </ul>

      {!visibles.length && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No hay ítems en esta categoría.
        </Card>
      )}
    </div>
  );
}
