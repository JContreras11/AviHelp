"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocumentoAnalizado } from "@/lib/ai/vision";
import type { ColaItem } from "./tipos";

const ESTADOS = ["vivo", "herido", "desaparecido", "detenido", "fallecido", "desconocido"];
const PRIORIDADES = ["baja", "media", "alta", "critica"];

function set<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

export function DocCard({
  item,
  onChange,
  onGuardar,
  onDescartar,
}: {
  item: ColaItem;
  onChange: (p: DocumentoAnalizado) => void;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  const p = item.preview;

  // Estados visuales no-listos (analizando / guardando / guardado / error)
  if (item.estado !== "listo") {
    const map: Record<string, { txt: string; cls: string }> = {
      pendiente: { txt: "En cola…", cls: "text-muted-foreground" },
      analizando: { txt: "🧠 Leyendo con IA…", cls: "text-primary animate-pulse" },
      guardando: { txt: "💾 Guardando…", cls: "text-primary animate-pulse" },
      guardado: { txt: "✓ Guardado", cls: "text-green-600" },
      error: { txt: `⚠️ ${item.error ?? "Error"}`, cls: "text-destructive" },
    };
    const e = map[item.estado] ?? map.pendiente;
    return (
      <Card className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {item.thumb && <img src={item.thumb} alt="" className="size-12 rounded-md object-cover shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.nombre}</p>
            <p className={`text-xs ${e.cls}`}>{e.txt}</p>
          </div>
        </div>
        {item.estado === "error" && (
          <Button size="sm" variant="ghost" onClick={onDescartar}>Quitar</Button>
        )}
      </Card>
    );
  }

  if (!p) return null;

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {item.thumb && <img src={item.thumb} alt="" className="size-10 rounded-md object-cover" />}
        <Badge>{p.tipo.replace(/_/g, " ")}</Badge>
        <Badge variant="secondary">confianza {Math.round(item.confianza * 100)}%</Badge>
        <Input
          value={p.contexto ?? ""}
          onChange={(e) => onChange({ ...p, contexto: e.target.value })}
          placeholder="Contexto"
          className="h-7 text-xs flex-1 min-w-[140px]"
        />
      </div>

      {/* Hospital editable */}
      {(p.hospital || p.insumos.length > 0) && (
        <Input
          value={p.hospital?.nombre ?? ""}
          onChange={(e) => onChange({ ...p, hospital: { nombre: e.target.value, ubicacion: p.hospital?.ubicacion ?? null } })}
          placeholder="Hospital (requerido para insumos)"
          className="h-8 text-sm"
        />
      )}

      {/* Personas editables */}
      {p.personas.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-72 overflow-auto pr-1">
          <p className="text-xs font-medium text-muted-foreground">{p.personas.length} persona(s) — edita lo que esté mal</p>
          {p.personas.map((per, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center">
              <Input
                value={per.nombre ?? ""}
                onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { nombre: e.target.value }) })}
                placeholder="Nombre"
                className="h-8 text-sm"
              />
              <Input
                value={per.edad ?? ""}
                onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { edad: e.target.value ? Number(e.target.value) : null }) })}
                placeholder="Edad"
                className="h-8 text-sm w-16"
              />
              <select
                value={per.estado_salud ?? "desconocido"}
                onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { estado_salud: e.target.value as any }) })}
                className="h-8 text-xs border rounded-md px-1 bg-background"
              >
                {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Insumos editables */}
      {p.insumos.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-72 overflow-auto pr-1">
          <p className="text-xs font-medium text-muted-foreground">{p.insumos.length} insumo(s)</p>
          {p.insumos.map((ins, i) => (
            <div key={i} className="grid grid-cols-[1fr_4rem_auto] gap-1.5 items-center">
              <Input
                value={ins.nombre ?? ""}
                onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { nombre: e.target.value }) })}
                className="h-8 text-sm"
              />
              <Input
                value={ins.cantidad ?? ""}
                onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { cantidad: e.target.value ? Number(e.target.value) : null }) })}
                placeholder="Cant."
                className="h-8 text-sm"
              />
              <select
                value={ins.prioridad ?? "media"}
                onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { prioridad: e.target.value as any }) })}
                className="h-8 text-xs border rounded-md px-1 bg-background"
              >
                {PRIORIDADES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onDescartar}>Descartar</Button>
        <Button size="sm" onClick={onGuardar}>Guardar</Button>
      </div>
    </Card>
  );
}
