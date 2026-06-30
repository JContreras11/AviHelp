"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CentroModal, tipoInfo, type Centro, type Need } from "./CentroModal";

// Leaflet toca window -> solo en cliente.
const MapaRefugios = dynamic(() => import("./MapaRefugios").then((m) => m.MapaRefugios), {
  ssr: false,
  loading: () => <div className="w-full h-full grid place-items-center text-sm text-muted-foreground">Cargando mapa…</div>,
});

const PRIO_CLS: Record<string, string> = {
  critica: "text-red-600 font-semibold", alta: "text-amber-600 font-semibold",
  media: "text-muted-foreground", baja: "text-muted-foreground",
};

// Normaliza para búsqueda flexible: sin acentos, minúsculas.
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function Refugios({ centros, needs }: { centros: Centro[]; needs: Need[] }) {
  const router = useRouter();
  const params = useSearchParams();

  // Estado inicial DESDE LA URL -> un enlace compartido carga ya filtrado.
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [tipo, setTipo] = useState<string | null>(() => params.get("tipo"));
  const [sel, setSel] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  // Tipos presentes en los datos (para el filtro). Orden estable.
  const tipos = useMemo(() => {
    const set = new Set(centros.map((c) => c.tipo ?? "otro"));
    return [...set].sort();
  }, [centros]);
  const tipoOpciones = useMemo(
    () => tipos.map((t) => { const i = tipoInfo(t); return { value: t, label: `${i.icon} ${i.label}` }; }),
    [tipos]
  );

  // Mantiene la URL sincronizada (compartible) sin recargar ni saltar el scroll.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (tipo) sp.set("tipo", tipo);
    const qs = sp.toString();
    router.replace(qs ? `/refugios?${qs}` : "/refugios", { scroll: false });
  }, [q, tipo, router]);

  // Coincide si TODAS las palabras aparecen en nombre/dirección y el tipo encaja.
  const filtrados = useMemo(() => {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    return centros.filter((c) => {
      if (tipo && (c.tipo ?? "otro") !== tipo) return false;
      if (!toks.length) return true;
      const texto = norm(`${c.nombre} ${c.ubicacion ?? ""}`);
      return toks.every((t) => texto.includes(t));
    });
  }, [q, tipo, centros]);

  const visibleIds = q.trim() || tipo ? filtrados.map((c) => c.id) : null;

  const seleccionar = useCallback((id: string) => {
    setSel(id);
    document.getElementById(`centro-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const centroAbierto = abierto ? centros.find((c) => c.id === abierto) ?? null : null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
        {/* MAPA — izquierda en escritorio (sticky), arriba en móvil. */}
        <div className="lg:col-span-7 lg:sticky lg:top-4 lg:self-start order-1">
          <div role="region" aria-label="Mapa de centros de atención"
            className="relative z-0 isolate rounded-2xl overflow-hidden border aspect-[16/11] sm:aspect-[2/1] lg:aspect-auto lg:h-[calc(100vh-7rem)]">
            <MapaRefugios pins={filtrados} sel={sel} onSelect={seleccionar} visibleIds={visibleIds} />
          </div>
        </div>

        {/* FILTROS + LISTA — derecha en escritorio. */}
        <div className="lg:col-span-5 order-2 flex flex-col gap-3 min-w-0">
          <div className="flex flex-col gap-2">
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              type="search" aria-label="Buscar por nombre, zona o parroquia"
              placeholder="🔎 Buscar por nombre, zona, parroquia…"
              className="w-full h-11 px-3 rounded-xl border bg-background text-base"
            />
            <SearchableSelect
              options={tipoOpciones} value={tipo} onChange={setTipo}
              placeholder="Tipo de lugar — todos"
            />
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filtrados.length} {filtrados.length === 1 ? "lugar" : "lugares"}{tipo || q ? " (filtrado)" : ""}
          </p>

          <div className="flex flex-col gap-2 lg:max-h-[calc(100vh-15rem)] lg:overflow-auto lg:-mr-2 lg:pr-2">
            {filtrados.map((c) => {
              const cn = needs.filter((n) => n.hospital_id === c.id);
              const info = tipoInfo(c.tipo);
              const tieneCoord = c.gps_lat != null && c.gps_lng != null;
              return (
                <div key={c.id} id={`centro-${c.id}`}
                  className={`rounded-2xl border bg-card p-3 scroll-mt-4 transition ${sel === c.id ? "ring-2 ring-primary" : ""}`}>
                  <button type="button" onClick={() => { setAbierto(c.id); if (tieneCoord) setSel(c.id); }}
                    className="text-left w-full" aria-label={`Ver ${c.nombre}`}>
                    <p className="font-semibold leading-tight flex items-center gap-1">
                      <span>{info.icon}</span><span className="min-w-0">{c.nombre}</span>
                    </p>
                    {c.ubicacion && <p className="text-sm text-muted-foreground">{c.ubicacion}</p>}
                    {cn.length > 0 && (
                      <p className="text-xs mt-1">
                        <span className="text-muted-foreground">Pide: </span>
                        {cn.slice(0, 3).map((n, i) => (
                          <span key={n.id} className={PRIO_CLS[n.prioridad] ?? ""}>{i > 0 ? ", " : ""}{n.nombre}</span>
                        ))}
                        {cn.length > 3 && <span className="text-muted-foreground"> +{cn.length - 3}</span>}
                      </p>
                    )}
                  </button>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setAbierto(c.id)}
                      className="flex-1 text-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted active:scale-[0.98] transition">
                      Ver detalle{cn.length ? ` · ${cn.length} ${cn.length === 1 ? "necesidad" : "necesidades"}` : ""}
                    </button>
                    {tieneCoord && (
                      <button type="button" onClick={() => seleccionar(c.id)} aria-label="Resaltar en el mapa"
                        className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted active:scale-[0.98] transition">📍</button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtrados.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                {centros.length === 0 ? "No hay centros cargados aún." : "Sin resultados con estos filtros."}
              </p>
            )}
          </div>
        </div>
      </div>

      {centroAbierto && (
        <CentroModal centro={centroAbierto} needs={needs.filter((n) => n.hospital_id === centroAbierto.id)} onClose={() => setAbierto(null)} />
      )}
    </>
  );
}
