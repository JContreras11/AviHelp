"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Img } from "@/components/Img";
import type { DocumentoAnalizado } from "@/lib/ai/vision";
import type { ColaItem } from "./tipos";

const ESTADOS = ["vivo", "herido", "desaparecido", "detenido", "fallecido", "desconocido"];
const PRIORIDADES = ["baja", "media", "alta", "critica"];

function set<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
const inputCls = "h-11 text-base text-foreground";
const selectCls = "h-11 text-base border rounded-lg px-2 bg-background w-full";

export function DocCard({
  item, onChange, onGuardar, onDescartar,
}: {
  item: ColaItem;
  onChange: (p: DocumentoAnalizado) => void;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  const p = item.preview;

  if (item.estado !== "listo") {
    const map: Record<string, { txt: string; cls: string }> = {
      pendiente: { txt: "En cola…", cls: "text-muted-foreground" },
      analizando: { txt: "🧠 Leyendo con IA…", cls: "text-primary animate-pulse" },
      guardando: { txt: "💾 Guardando…", cls: "text-primary animate-pulse" },
      guardado: { txt: "✓ Guardado", cls: "text-green-600 font-semibold" },
      error: { txt: `⚠️ ${item.error ?? "Error"}`, cls: "text-destructive" },
    };
    const e = map[item.estado] ?? map.pendiente;
    return (
      <Card className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {item.thumb && <Img src={item.thumb} className="size-14 rounded-lg object-cover shrink-0" />}
          <div className="min-w-0">
            <p className="text-base font-medium truncate">{item.nombre}</p>
            <p className={`text-sm ${e.cls}`}>{e.txt}</p>
          </div>
        </div>
        {item.estado === "error" && <Button variant="ghost" onClick={onDescartar}>Quitar</Button>}
      </Card>
    );
  }
  if (!p) return null;

  const esInsumos = p.insumos.length > 0;

  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-4">
      {/* Cabecera: foto grande (zoom) + tipo */}
      <div className="flex items-center gap-3 flex-wrap">
        {item.thumb && <Img src={item.thumb} className="size-16 rounded-xl object-cover shrink-0 ring-1 ring-border cursor-zoom-in" />}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="text-sm py-1 px-3">{p.tipo.replace(/_/g, " ")}</Badge>
          <Badge variant="secondary" className="text-sm py-1 px-3">confianza {Math.round(item.confianza * 100)}%</Badge>
        </div>
      </div>

      <Campo label="¿Qué es este documento?">
        <Input value={p.contexto ?? ""} onChange={(e) => onChange({ ...p, contexto: e.target.value })} className={inputCls} />
      </Campo>

      {(p.hospital || esInsumos) && (
        <Campo label="🏥 Hospital">
          <Input
            value={p.hospital?.nombre ?? ""}
            onChange={(e) => onChange({ ...p, hospital: { nombre: e.target.value, ubicacion: p.hospital?.ubicacion ?? null } })}
            placeholder="Nombre del hospital"
            className={inputCls}
          />
        </Campo>
      )}

      {/* Personas — cada una su sub-card editable */}
      {p.personas.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{p.personas.length} persona(s) — revisa y corrige</p>
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto pr-1">
            {p.personas.map((per, i) => (
              <div key={i} className="rounded-xl border p-3 flex flex-col gap-3 bg-muted/20">
                <Campo label="Nombre">
                  <Input value={per.nombre ?? ""} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { nombre: e.target.value }) })} className={inputCls} />
                </Campo>
                <div className="grid grid-cols-3 gap-2">
                  <Campo label="Cédula">
                    <Input value={per.cedula ?? ""} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { cedula: e.target.value }) })} placeholder="V-…" className={inputCls} />
                  </Campo>
                  <Campo label="Edad">
                    <Input value={per.edad ?? ""} inputMode="numeric" onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { edad: e.target.value ? Number(e.target.value) : null }) })} className={inputCls} />
                  </Campo>
                  <Campo label="Sexo">
                    <select value={per.sexo ?? "desconocido"} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { sexo: e.target.value as any }) })} className={selectCls}>
                      {["M", "F", "O", "desconocido"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Campo>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Estado">
                    <select value={per.estado_salud ?? "desconocido"} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { estado_salud: e.target.value as any }) })} className={selectCls}>
                      {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Ubicación">
                    <Input value={per.ubicacion ?? ""} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { ubicacion: e.target.value }) })} className={inputCls} />
                  </Campo>
                </div>
                <Campo label="📞 Teléfono de contacto">
                  <Input value={per.telefono_contacto ?? ""} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { telefono_contacto: e.target.value }) })} placeholder="Opcional" className={inputCls} />
                </Campo>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insumos */}
      {esInsumos && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{p.insumos.length} insumo(s)</p>
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto pr-1">
            {p.insumos.map((ins, i) => (
              <div key={i} className="rounded-xl border p-3 flex flex-col gap-2 bg-muted/20">
                <Campo label="Insumo">
                  <Input value={ins.nombre ?? ""} onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { nombre: e.target.value }) })} className={inputCls} />
                </Campo>
                <div className="grid grid-cols-3 gap-2">
                  <Campo label="Cantidad">
                    <Input value={ins.cantidad ?? ""} inputMode="numeric" onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { cantidad: e.target.value ? Number(e.target.value) : null }) })} className={inputCls} />
                  </Campo>
                  <Campo label="Unidad">
                    <Input value={ins.unidad ?? ""} onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { unidad: e.target.value }) })} placeholder="cajas…" className={inputCls} />
                  </Campo>
                  <Campo label="Prioridad">
                    <select value={ins.prioridad ?? "media"} onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { prioridad: e.target.value as any }) })} className={selectCls}>
                      {PRIORIDADES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Campo>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="lg" onClick={onDescartar}>Descartar</Button>
        <Button size="lg" onClick={onGuardar} className="px-8">Guardar</Button>
      </div>
    </Card>
  );
}
