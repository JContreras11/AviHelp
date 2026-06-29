"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Img } from "@/components/Img";
import type { DocumentoAnalizado } from "@/lib/ai/vision";
import type { ColaItem } from "./tipos";

export type HospitalOpt = { id: string; nombre: string; tipo: string };

const ESTADOS = ["vivo", "herido", "desaparecido", "fallecido", "desconocido"];
const PRIORIDADES = ["baja", "media", "alta", "critica"];

function set<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

// Normaliza un nombre de institución para emparejar (ignora acentos, prefijos y puntuación).
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")    .replace(/\b(hospital|clinica|instituto|medico|centro|de|del|la|el|los|las)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();

// Empareja el nombre detectado por IA contra la lista de instituciones existentes.
function emparejar(nombre: string | null | undefined, lista: HospitalOpt[]): HospitalOpt | null {
  const n = norm(nombre);
  if (!n) return null;
  let m = lista.find((h) => norm(h.nombre) === n);
  if (m) return m;
  m = lista.find((h) => { const hn = norm(h.nombre); return !!hn && (hn.includes(n) || n.includes(hn)); });
  return m ?? null;
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
  item, onChange, onNotas, onGuardar, onDescartar, onReintentar, hospitales = [],
}: {
  item: ColaItem;
  onChange: (p: DocumentoAnalizado) => void;
  onNotas: (notas: string) => void;
  onGuardar: () => void;
  onDescartar: () => void;
  onReintentar?: () => void;
  hospitales?: HospitalOpt[];
}) {
  const p = item.preview;

  // Auto-empareja el hospital detectado con uno existente (link por id, sin duplicar).
  // id undefined = aún sin resolver; tras esto: uuid (existente) o null (crear nuevo).
  useEffect(() => {
    if (item.estado !== "listo" || !p?.hospital?.nombre || p.hospital.id !== undefined || !hospitales.length) return;
    const m = emparejar(p.hospital.nombre, hospitales);
    onChange({ ...p, hospital: { id: m ? m.id : null, nombre: m ? m.nombre : p.hospital.nombre, ubicacion: p.hospital.ubicacion ?? null } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.estado, hospitales, p?.hospital?.nombre, p?.hospital?.id]);

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
        <div className="flex items-center gap-1 shrink-0">
          {item.estado === "error" && onReintentar && (
            <Button type="button" size="sm" variant="outline" onClick={onReintentar}>↻ Reintentar</Button>
          )}
          {item.estado !== "guardado" && (
            <button type="button" onClick={onDescartar} title="Quitar"
              className="size-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition">✕</button>
          )}
        </div>
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

      {/* Hospital: SELECT contra existentes (se enlaza por id, sin duplicar). Solo se crea
          uno nuevo si lo eliges a propósito o si la IA no lo detectó. */}
      <Campo label="🏥 Hospital / institución">
        <select
          value={p.hospital?.id ?? (p.hospital?.nombre ? "__nuevo__" : "")}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onChange({ ...p, hospital: null });
            else if (v === "__nuevo__") onChange({ ...p, hospital: { id: null, nombre: p.hospital?.nombre ?? "", ubicacion: p.hospital?.ubicacion ?? null } });
            else { const h = hospitales.find((x) => x.id === v); onChange({ ...p, hospital: { id: v, nombre: h?.nombre ?? "", ubicacion: p.hospital?.ubicacion ?? null } }); }
          }}
          className={selectCls}
        >
          <option value="">— Ninguno —</option>
          {hospitales.map((h) => (
            <option key={h.id} value={h.id}>{h.nombre}{h.tipo === "clinica" ? " (clínica)" : h.tipo === "refugio" ? " (refugio)" : ""}</option>
          ))}
          <option value="__nuevo__">➕ Crear institución nueva…</option>
        </select>
      </Campo>
      {/* Crear nueva (deliberado / no detectada): nombre editable solo en este caso. */}
      {p.hospital && !p.hospital.id && (
        <Campo label="Nombre de la nueva institución">
          <Input
            value={p.hospital.nombre ?? ""}
            onChange={(e) => onChange({ ...p, hospital: { id: null, nombre: e.target.value, ubicacion: p.hospital?.ubicacion ?? null } })}
            placeholder="Ej: Clínica La Floresta"
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Campo label="Cédula">
                    <Input value={per.cedula ?? ""} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { cedula: e.target.value }) })} placeholder="V-…" className={inputCls} />
                  </Campo>
                  <Campo label="Edad">
                    <Input value={per.edad ?? ""} inputMode="numeric" onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { edad: e.target.value ? Number(e.target.value) : null }) })} className={inputCls} />
                  </Campo>
                  {/* Sexo: enum M/F. La IA lo prellena desde el nombre; siempre editable por selector. */}
                  <Campo label="Sexo">
                    <select value={per.sexo === "M" || per.sexo === "F" ? per.sexo : ""} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { sexo: e.target.value as any }) })} className={selectCls}>
                      {!(per.sexo === "M" || per.sexo === "F") && <option value="" disabled>—</option>}
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </Campo>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Estado">
                    <select value={per.estado_salud ?? "desconocido"} onChange={(e) => onChange({ ...p, personas: set(p.personas, i, { estado_salud: e.target.value as any }) })} className={selectCls}>
                      {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Procedencia">
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
              <div key={i} className={`rounded-xl border p-3 flex flex-col gap-2 bg-muted/20 ${!ins.area ? "ring-1 ring-amber-400" : ""}`}>
                <Campo label="Insumo">
                  <Input value={ins.nombre ?? ""} onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { nombre: e.target.value }) })} className={inputCls} />
                </Campo>
                <Campo label="Servicio / Departamento *">
                  <Input value={ins.area ?? ""} onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { area: e.target.value }) })}
                    placeholder="Traumatología, UCI Pediátrica…" className={`${inputCls} ${!ins.area ? "border-amber-400" : ""}`} />
                </Campo>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Campo label="Cantidad">
                    <Input value={ins.cantidad ?? ""} inputMode="numeric" onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { cantidad: e.target.value ? Number(e.target.value) : null }) })} className={inputCls} />
                  </Campo>
                  <Campo label="Tipo">
                    <Input value={ins.presentacion ?? ""} onChange={(e) => onChange({ ...p, insumos: set(p.insumos, i, { presentacion: e.target.value }) })} placeholder="frasco…" className={inputCls} />
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

      <Campo label="📝 Texto adicional / contexto (mejora la búsqueda)">
        <textarea
          value={item.notas ?? ""}
          onChange={(e) => onNotas(e.target.value)}
          rows={2}
          placeholder="Cualquier dato extra: de dónde viene la lista, observaciones, etc."
          className="border rounded-lg p-2 text-base bg-background"
        />
      </Campo>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="lg" onClick={onDescartar}>Descartar</Button>
        <Button size="lg" onClick={onGuardar} className="px-8">Guardar</Button>
      </div>
    </Card>
  );
}
