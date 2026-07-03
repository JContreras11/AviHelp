"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { InsumoDialog } from "@/components/datos/Detalle";

// Tablero de CONCILIACIÓN: cada necesidad activa con las entregas en curso que la cubren
// y banderas accionables. Datos reales del ciclo (no match_sugerencias). Scope por rol.
type Entrega = { id: string; codigo: string; estado: string; cantidad: number | null; entrega_nombre: string | null; nota: string | null };
type Fila = {
  id: string; nombre: string; area: string | null; prioridad: string; hospital_id: string; hospitalNombre: string;
  solicitada: number; enCamino: number; recibida: number; entregas: Entrega[]; activasEnCurso: number;
  flags: { sinCobertura: boolean; discrepancia: boolean; rechazadas: number; estancada: boolean };
};

const PRIO: Record<string, string> = {
  critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-800",
  media: "bg-muted text-muted-foreground", baja: "bg-muted text-muted-foreground",
};
const EST_ENT: Record<string, string> = {
  registrada: "por llegar", en_camino_acopio: "→ acopio", en_acopio: "en acopio",
  en_camino_hospital: "→ hospital", recibido: "recibido", rechazado: "rechazado", cancelado: "cancelado",
};
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Triage({ inicial }: { inicial: Fila[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [insumoOpen, setInsumoOpen] = useState<string | null>(null);

  const necesitaAtencion = (f: Fila) => f.flags.sinCobertura || f.flags.discrepancia || f.flags.estancada || f.flags.rechazadas > 0;

  const filas = useMemo(() => {
    let xs = inicial;
    if (soloAtencion) xs = xs.filter(necesitaAtencion);
    const t = norm(q).trim();
    if (t) xs = xs.filter((f) => norm(`${f.nombre} ${f.area ?? ""} ${f.hospitalNombre}`).includes(t));
    return xs;
  }, [inicial, q, soloAtencion]);

  const totales = useMemo(() => ({
    sinCobertura: inicial.filter((f) => f.flags.sinCobertura).length,
    banderas: inicial.filter((f) => f.flags.discrepancia || f.flags.estancada || f.flags.rechazadas > 0).length,
    enCurso: inicial.reduce((n, f) => n + f.activasEnCurso, 0),
  }), [inicial]);

  return (
    <div className="flex flex-col gap-3">
      {/* Resumen accionable */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-3"><div className="text-2xl font-bold text-red-600">{totales.sinCobertura}</div><div className="text-xs text-muted-foreground">Críticas sin cobertura</div></div>
        <div className="rounded-xl border p-3"><div className="text-2xl font-bold text-amber-600">{totales.banderas}</div><div className="text-xs text-muted-foreground">Con bandera (revisar)</div></div>
        <div className="rounded-xl border p-3"><div className="text-2xl font-bold text-sky-600">{totales.enCurso}</div><div className="text-xs text-muted-foreground">Entregas en curso</div></div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="🔎 Filtrar por necesidad, área u hospital…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 text-sm flex-1 min-w-[12rem]" />
        <button onClick={() => setSoloAtencion((v) => !v)} className={`h-10 px-3 rounded-lg border text-sm font-medium ${soloAtencion ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
          {soloAtencion ? "Mostrando: requiere atención" : "Solo lo que requiere atención"}
        </button>
      </div>

      {filas.map((f) => (
        <div key={f.id} className="rounded-2xl border p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate capitalize">{f.nombre}</p>
              <p className="text-xs text-muted-foreground truncate">{f.hospitalNombre}{f.area ? ` · ${f.area}` : ""}</p>
            </div>
            <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PRIO[f.prioridad] ?? "bg-muted"}`}>{f.prioridad}</span>
          </div>

          {/* Cobertura: solicitado vs en camino vs recibido */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Solicitado <b className="text-foreground">{f.solicitada}</b></span>
            <span className="text-sky-700">🚚 {f.enCamino}</span>
            <span className="text-emerald-700">✅ {f.recibida}</span>
          </div>

          {/* Banderas */}
          {(f.flags.sinCobertura || f.flags.discrepancia || f.flags.estancada || f.flags.rechazadas > 0) && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {f.flags.sinCobertura && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-semibold">🚨 crítica sin cobertura</span>}
              {f.flags.discrepancia && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 font-semibold">📍 discrepancia de ubicación</span>}
              {f.flags.estancada && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-semibold">⏳ entrega estancada</span>}
              {f.flags.rechazadas > 0 && <span className="rounded-full bg-gray-200 text-gray-700 px-2 py-0.5 font-semibold">✖ {f.flags.rechazadas} rechazada(s)</span>}
            </div>
          )}

          {/* Entregas en curso ligadas */}
          {f.entregas.filter((e) => !["recibido", "rechazado", "cancelado"].includes(e.estado)).length > 0 && (
            <div className="rounded-xl bg-muted/40 p-2.5 flex flex-col gap-1">
              {f.entregas.filter((e) => !["recibido", "rechazado", "cancelado"].includes(e.estado)).slice(0, 4).map((e) => (
                <a key={e.id} href={`/donaciones/${e.codigo}`} className="flex items-center justify-between gap-2 text-xs hover:underline">
                  <span className="truncate">{e.cantidad ? `${e.cantidad} · ` : ""}{e.entrega_nombre ?? "Donación"} <span className="font-mono text-muted-foreground">{e.codigo}</span></span>
                  <span className="shrink-0 rounded px-1.5 py-0.5 bg-background border">{EST_ENT[e.estado] ?? e.estado}</span>
                </a>
              ))}
            </div>
          )}

          <button onClick={() => setInsumoOpen(f.id)} className="self-start text-sm font-medium text-primary underline">Gestionar necesidad →</button>
        </div>
      ))}

      {filas.length === 0 && (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          {inicial.length === 0 ? "Sin necesidades activas en tu alcance." : "Nada coincide con el filtro."}
        </p>
      )}

      {insumoOpen && <InsumoDialog id={insumoOpen} onClose={() => setInsumoOpen(null)} onChanged={() => router.refresh()} />}
    </div>
  );
}
