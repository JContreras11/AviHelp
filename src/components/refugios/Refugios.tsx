"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { crearInsumo } from "@/app/actions/crud";

// Leaflet toca window -> solo en cliente.
const MapaRefugios = dynamic(() => import("./MapaRefugios").then((m) => m.MapaRefugios), {
  ssr: false,
  loading: () => <div className="w-full h-full grid place-items-center text-sm text-muted-foreground">Cargando mapa…</div>,
});

type Refugio = { id: string; nombre: string; tipo?: string; ubicacion: string | null; gps_lat?: number | null; gps_lng?: number | null };
type Need = { id: string; hospital_id: string; nombre: string; cantidad: number | null; unidad: string | null; area: string | null; prioridad: string; estado: string };

const CATEGORIAS = ["Medicinas", "Comida", "Agua", "Ropa", "Higiene", "Colchonetas", "Otro"];
const PRIO = ["baja", "media", "alta", "critica"];
const PRIO_CLS: Record<string, string> = { critica: "text-red-600 font-semibold", alta: "text-amber-600 font-semibold", media: "text-muted-foreground", baja: "text-muted-foreground" };
const selCls = "border rounded-lg h-10 px-2 text-base bg-background w-full";

const mapQ = (r: Refugio) => encodeURIComponent(`${r.nombre}, ${r.ubicacion ?? ""}, La Guaira, Venezuela`);

// Normaliza para búsqueda flexible: sin acentos, minúsculas. "maiquetia" ≈ "Maiquetía".
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Refugios({ refugios, needs, gestiona }: { refugios: Refugio[]; needs: Need[]; gestiona: "all" | string[] }) {
  const puede = (id: string) => gestiona === "all" || gestiona.includes(id);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Coincide si TODAS las palabras del buscador aparecen en nombre/dirección (parcial, sin acentos).
  const filtrados = useMemo(() => {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return refugios;
    return refugios.filter((r) => {
      const texto = norm(`${r.nombre} ${r.ubicacion ?? ""}`);
      return toks.every((t) => texto.includes(t));
    });
  }, [q, refugios]);
  const visibleIds = q.trim() ? filtrados.map((r) => r.id) : null;

  // Estable (ref) para no recrear el mapa. Lleva la tarjeta a la vista.
  const seleccionar = useCallback((id: string) => {
    setSel(id);
    document.getElementById(`refugio-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <>
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        type="search" aria-label="Buscar refugio por nombre, zona o parroquia"
        placeholder="🔎 Buscar refugio por nombre, zona, parroquia…"
        className="w-full h-11 px-3 mb-3 rounded-xl border bg-background text-base"
      />
      <div role="region" aria-label="Mapa de refugios" className="relative z-0 isolate rounded-2xl overflow-hidden border mb-4 aspect-[16/10] sm:aspect-[2/1]">
        <MapaRefugios pins={refugios} sel={sel} onSelect={seleccionar} visibleIds={visibleIds} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filtrados.map((r) => (
          <Tarjeta key={r.id} r={r} needs={needs.filter((n) => n.hospital_id === r.id)} gestiona={puede(r.id)}
            selected={sel === r.id} onSelect={() => seleccionar(r.id)} />
        ))}
        {filtrados.length === 0 && (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {refugios.length === 0 ? "No hay refugios cargados aún." : `Sin resultados para “${q}”.`}
          </p>
        )}
      </div>
    </>
  );
}

function Tarjeta({ r, needs, gestiona, selected, onSelect }: { r: Refugio; needs: Need[]; gestiona: boolean; selected: boolean; onSelect: () => void }) {
  const router = useRouter();
  const [abrir, setAbrir] = useState(false);
  const [, refrescar] = useTransition();
  const [f, setF] = useState({ nombre: "", area: "Comida", cantidad: "", unidad: "", prioridad: "media" });
  const [guardando, setGuardando] = useState(false);

  async function solicitar() {
    if (!f.nombre.trim()) { toast.error("Escribe qué se necesita."); return; }
    if (f.cantidad && !(Number(f.cantidad) > 0)) { toast.error("La cantidad debe ser un número mayor que 0."); return; }
    setGuardando(true);
    try {
      const r2 = await crearInsumo(r.id, {
        nombre: f.nombre.trim(), area: f.area, unidad: f.unidad.trim(), prioridad: f.prioridad,
        cantidad: f.cantidad ? Number(f.cantidad) : null,
      });
      if (!r2.ok) { toast.error((r2 as any).error ?? "No se pudo guardar."); return; }
      toast.success("Solicitud agregada");
      setF({ nombre: "", area: "Comida", cantidad: "", unidad: "", prioridad: "media" });
      setAbrir(false);
      refrescar(() => router.refresh());
    } catch {
      toast.error("Error de red. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const tieneCoord = r.gps_lat != null && r.gps_lng != null;
  return (
    <div id={`refugio-${r.id}`} className={`rounded-2xl border bg-card p-4 flex flex-col gap-2 scroll-mt-4 transition ${selected ? "ring-2 ring-primary" : ""}`}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="text-left" disabled={!tieneCoord} title={tieneCoord ? "Ver en el mapa" : ""}>
        <p className="font-semibold leading-tight">{r.nombre}{tieneCoord ? " 📍" : ""}</p>
        {r.ubicacion && <p className="text-sm text-muted-foreground">{r.ubicacion}</p>}
      </button>

      {needs.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Solicita ahora</p>
          {needs.map((n) => (
            <p key={n.id} className="flex justify-between gap-2 text-sm border-b py-0.5">
              <span>{n.nombre}{n.cantidad ? ` · ${n.cantidad}${n.unidad ? " " + n.unidad : ""}` : ""}{n.area ? ` · ${n.area}` : ""}</span>
              <span className={`text-xs capitalize ${PRIO_CLS[n.prioridad] ?? ""}`}>{n.prioridad}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sin solicitudes activas.</p>
      )}

      <div className="flex gap-2 mt-1">
        <a href={`https://www.google.com/maps/search/?api=1&query=${mapQ(r)}`} target="_blank" rel="noreferrer"
          className="flex-1 text-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted active:scale-[0.98] transition">🗺️ Mapa</a>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${mapQ(r)}`} target="_blank" rel="noreferrer"
          className="flex-1 text-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted active:scale-[0.98] transition">🧭 Cómo llegar</a>
      </div>

      {/* Solo admin o miembros de ESTE refugio pueden solicitar (scope). */}
      {gestiona && (
        abrir ? (
          <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2 mt-1">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="¿Qué necesitan? (ej. Agua potable)" className="h-10 text-base" />
            <div className="grid grid-cols-2 gap-2">
              <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className={selCls}>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })} className={`${selCls} capitalize`}>
                {PRIO.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <Input value={f.cantidad} inputMode="numeric" onChange={(e) => setF({ ...f, cantidad: e.target.value })} placeholder="Cantidad" className="h-10 text-base" />
              <Input value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} placeholder="Unidad (cajas, L…)" className="h-10 text-base" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={solicitar} disabled={guardando} className="flex-1">{guardando ? "Guardando…" : "Agregar solicitud"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAbrir(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAbrir(true)} className="mt-1">➕ Solicitar insumo</Button>
        )
      )}
    </div>
  );
}
