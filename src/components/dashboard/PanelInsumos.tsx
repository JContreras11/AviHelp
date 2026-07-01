"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { DonarBoton, type InsumoDonable } from "@/components/DonarInsumo";
import { InsumoDialog } from "@/components/datos/Detalle";
import { useRol } from "@/lib/rol";
import type { Analytics, HospitalStat, InsumoLite } from "@/app/actions/analytics";

const MapaRefugios = dynamic(() => import("@/components/refugios/MapaRefugios").then((m) => m.MapaRefugios), {
  ssr: false,
  loading: () => <div className="w-full h-full grid place-items-center text-sm text-muted-foreground">Cargando mapa…</div>,
});

const PRIO_PILL: Record<string, string> = {
  critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-800",
  media: "bg-muted text-muted-foreground", baja: "bg-muted text-muted-foreground",
};
const ESTADO_PILL: Record<string, string> = {
  solicitado: "bg-amber-100 text-amber-800", en_transito: "bg-blue-100 text-blue-700",
  entregado: "bg-green-100 text-green-700", cubierto: "bg-green-100 text-green-700",
};
const TIPO_ICON: Record<string, string> = { refugio: "🏠", hospital: "🏥", clinica: "🏥", centro: "📦" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

function Kpi({ label, valor, color, hint, tip }: { label: string; valor: number; color: string; hint?: string; tip?: React.ReactNode }) {
  return (
    <Card className="p-4" role="group" aria-label={`${label}: ${valor}`}>
      <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${color}`}>{valor.toLocaleString("es")}</div>
      <div className="text-sm font-medium mt-1">{label}{tip && <> <HelpTip label={`Qué significa ${label}`}>{tip}</HelpTip></>}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}

// Barra horizontal simple (sin librería): ranking legible and mobile-first.
function Barra({ label, value, max, sub, color = "bg-primary" }: { label: string; value: number; max: number; sub?: string; color?: string }) {
  const w = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground shrink-0">{value}{sub ? ` · ${sub}` : ""}</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} /></div>
    </div>
  );
}

const insumoDonable = (i: InsumoLite): InsumoDonable => ({
  id: i.id, nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad,
  presentacion: i.presentacion, hospital_id: i.hospital_id, hospitales: { nombre: i.hospitalNombre },
});

export function PanelInsumos({ data }: { data: Analytics }) {
  const router = useRouter();
  const { rol, puede, gestiona, donante, coordinador } = useRol();
  const esAdmin = rol === "admin";
  // "Accionable": quien puede actuar sobre insumos (coordina entrega, dona, o gestiona).
  const accionable = esAdmin || coordinador || donante || puede("tracking");
  const distilled = !accionable; // público / solo-lectura

  const [selHosp, setSelHosp] = useState<string | null>(null);
  const [insumoOpen, setInsumoOpen] = useState<string | null>(null);
  const [soloCriticos, setSoloCriticos] = useState(false);
  const [buscarHosp, setBuscarHosp] = useState("");
  const [buscarInsumo, setBuscarInsumo] = useState("");

  const hospConActivos = useMemo(() => data.hospitales.filter((h) => h.activos > 0), [data.hospitales]);
  const hospSel = useMemo(() => data.hospitales.find((h) => h.id === selHosp) ?? null, [data.hospitales, selHosp]);

  const hospConActivosFiltrados = useMemo(() => {
    const q = buscarHosp.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!q) return hospConActivos;
    return hospConActivos.filter(h => 
      (h.nombre ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
      (h.ubicacion ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [hospConActivos, buscarHosp]);

  const insumosVista = useMemo(() => {
    let list = data.insumosActivos;
    if (selHosp) list = list.filter((i) => i.hospital_id === selHosp);
    if (soloCriticos) list = list.filter((i) => i.prioridad === "alta" || i.prioridad === "critica");
    const q = buscarInsumo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (q) {
      list = list.filter(i => 
        (i.nombre ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
        (i.area ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
      );
    }
    return list;
  }, [data.insumosActivos, selHosp, soloCriticos, buscarInsumo]);

  const maxDem = data.demanda[0]?.veces ?? 1;
  const maxZona = data.zonas[0]?.n ?? 1;

  // Recarga server (analytics) tras un cambio de estado/donación -> stats al día.
  const refrescar = () => router.refresh();

  function compartir(path: string, titulo: string) {
    const url = `${window.location.origin}${path}`;
    if (navigator.share) { navigator.share({ title: titulo, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).then(() => toast.success("Enlace copiado")).catch(() => toast.error("No se pudo copiar"));
  }

  const hospOpciones = useMemo(
    () => hospConActivos.map((h) => ({ value: h.id, label: `${TIPO_ICON[h.tipo ?? ""] ?? "📍"} ${h.nombre}`, keywords: h.ubicacion ?? "" })),
    [hospConActivos]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs centrados en INSUMOS (no en personas). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Insumos por cubrir" valor={data.activosTotal} color="text-primary" hint="solicitados + en tránsito" tip="Insumos solicitados que aún no llegan, incluyendo los que ya están en camino." />
        <Kpi label="Críticos pendientes" valor={data.criticosTotal} color="text-red-600" hint="prioridad alta o crítica" tip="Insumos graves (prioridad alta o crítica) que todavía no se cubren. Son los más urgentes." />
        <Kpi label="En tránsito" valor={data.enTransitoTotal} color="text-blue-600" hint="ya en camino" />
        <Kpi label="Atendidos" valor={data.atendidosTotal} color="text-green-600" hint="entregados o cubiertos" tip="De todo lo solicitado, los insumos ya entregados o cubiertos. Compáralo con «por cubrir» para ver el avance." />
      </div>

      {/* Decisión: qué se necesita más y dónde (visible para TODOS). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="font-semibold mb-1">Insumos más pedidos</h2>
          <p className="text-xs text-muted-foreground mb-3">Con qué frecuencia se solicita cada cosa (solo pendientes).</p>
          <div className="flex flex-col gap-3">
            {data.demanda.length === 0 && <p className="text-sm text-muted-foreground">Sin solicitudes pendientes.</p>}
            {data.demanda.map((d) => (
              <Barra key={d.nombre} label={d.nombre} value={d.veces} max={maxDem}
                sub={`${d.cantidad ? `${d.cantidad} und` : ""}${d.criticos ? ` · ${d.criticos} grave` : ""}`.trim().replace(/^· /, "")}
                color={d.criticos ? "bg-red-500" : "bg-primary"} />
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-1">Dónde se necesita más</h2>
          <p className="text-xs text-muted-foreground mb-3">Mapa de calor por zona: insumos pendientes y cuántos son graves.</p>
          <div className="flex flex-col gap-3">
            {data.zonas.length === 0 && <p className="text-sm text-muted-foreground">Sin zonas con necesidades.</p>}
            {data.zonas.map((z) => (
              <Barra key={z.zona} label={z.zona} value={z.n} max={maxZona}
                sub={z.criticos ? `${z.criticos} grave` : undefined} color={z.criticos ? "bg-red-500" : "bg-[#14b8a6]"} />
            ))}
          </div>
        </Card>
      </div>

      {distilled ? (
        // PÚBLICO — vista destilada: lugares que más piden + donar/compartir.
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold text-lg">Lugares que más necesitan ayuda</h2>
            <Input
              placeholder="Buscar hospital o refugio…"
              value={buscarHosp}
              onChange={(e) => setBuscarHosp(e.target.value)}
              className="w-full sm:w-64 h-9 text-sm"
            />
          </div>
          <ul className="flex flex-col gap-2">
            {hospConActivosFiltrados.slice(0, 12).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                <span className="min-w-0">
                  <span className="font-medium block truncate">{TIPO_ICON[h.tipo ?? ""] ?? "📍"} {h.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {h.activos} por cubrir{h.criticos ? ` · ${h.criticos} grave` : ""}{h.ubicacion ? ` · ${h.ubicacion}` : ""}
                  </span>
                </span>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => compartir(`/compartir/hospital/${h.id}`, h.nombre)}>↗ Compartir</Button>
              </li>
            ))}
            {hospConActivosFiltrados.length === 0 && <li className="text-sm text-muted-foreground">No se encontraron instituciones.</li>}
          </ul>
        </Card>
      ) : (
        // ADMIN / COORDINADOR / ONG — espacio de trabajo accionable.
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Lista de instituciones — IZQUIERDA en escritorio; en móvil va DESPUÉS de los insumos. */}
          <div className="lg:col-span-4 order-2 lg:order-1 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Instituciones</h2>
              {selHosp && <button className="text-xs text-primary" onClick={() => setSelHosp(null)}>Ver todas</button>}
            </div>
            <Input
              placeholder="Filtrar por nombre o ubicación…"
              value={buscarHosp}
              onChange={(e) => setBuscarHosp(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="flex flex-col gap-2 lg:max-h-[70vh] lg:overflow-auto lg:pr-1">
              {hospConActivosFiltrados.map((h) => (
                <button key={h.id} type="button" onClick={() => setSelHosp(h.id === selHosp ? null : h.id)}
                  className={`text-left rounded-xl border p-3 transition hover:bg-muted/50 ${selHosp === h.id ? "ring-2 ring-primary" : ""}`}>
                  <span className="font-medium block truncate">{TIPO_ICON[h.tipo ?? ""] ?? "📍"} {h.nombre}</span>
                  <span className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span>{h.activos} por cubrir</span>
                    {h.criticos > 0 && <span className="text-red-600 font-semibold">{h.criticos} grave</span>}
                    {h.enTransito > 0 && <span className="text-blue-600">{h.enTransito} en camino</span>}
                  </span>
                </button>
              ))}
              {hospConActivosFiltrados.length === 0 && <p className="text-sm text-muted-foreground">No se encontraron instituciones.</p>}
            </div>
          </div>

          {/* Insumos + mapa — DERECHA en escritorio; PRIMERO en móvil (sin mapa en móvil). */}
          <div className="lg:col-span-8 order-1 lg:order-2 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto min-w-0">
                <h2 className="font-semibold">
                  {hospSel ? `${hospSel.nombre} — qué necesita` : "Insumos por cubrir"}
                </h2>
                {hospSel?.ubicacion && (
                  <p className="text-xs text-muted-foreground truncate">📍 {hospSel.ubicacion}</p>
                )}
              </div>
              <Input
                placeholder="Buscar necesidad…"
                value={buscarInsumo}
                onChange={(e) => setBuscarInsumo(e.target.value)}
                className="w-full sm:w-48 h-9 text-sm"
              />
              <SearchableSelect className="w-full sm:w-64" options={hospOpciones} value={selHosp} onChange={setSelHosp} placeholder="Filtrar por institución…" />
              <Button size="sm" variant={soloCriticos ? "default" : "outline"} onClick={() => setSoloCriticos((v) => !v)}>
                {soloCriticos ? "✓ Solo graves" : "Solo graves"}
              </Button>
            </div>

            {/* Mapa de la institución seleccionada — solo escritorio (mobile = insumos primero). */}
            {hospSel && hospSel.gps_lat != null && hospSel.gps_lng != null && (
              <div className="hidden lg:block relative z-0 isolate rounded-2xl overflow-hidden border aspect-[2/1]">
                <MapaRefugios pins={[{ id: hospSel.id, nombre: hospSel.nombre, tipo: hospSel.tipo, ubicacion: hospSel.ubicacion, gps_lat: hospSel.gps_lat, gps_lng: hospSel.gps_lng }]} sel={hospSel.id} onSelect={() => {}} />
              </div>
            )}

            <div className="flex flex-col gap-2">
              {insumosVista.length === 0 && (
                <p className="text-sm text-muted-foreground rounded-xl border p-4 text-center">
                  {soloCriticos ? "No hay insumos graves pendientes aquí." : "No hay insumos pendientes aquí. 🎉"}
                </p>
              )}
              {insumosVista.slice(0, 80).map((i) => (
                <div key={i.id} className="rounded-xl border p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium block">{i.nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {[i.cantidad ? `${i.cantidad}${i.unidad ? " " + i.unidad : ""}` : null, i.area, !hospSel ? i.hospitalNombre : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PRIO_PILL[i.prioridad] ?? "bg-muted"}`}>{i.prioridad}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${ESTADO_PILL[i.estado] ?? "bg-muted"}`}>{cap(i.estado)}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DonarBoton insumo={insumoDonable(i)} className="flex-1 min-w-[110px] !h-9 !text-sm" />
                    <Button size="sm" variant="outline" className="flex-1 min-w-[110px] h-9" onClick={() => setInsumoOpen(i.id)}>
                      {gestiona(i.hospital_id) ? "⚙️ Gestionar" : "📦 Ver donaciones"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 px-3" aria-label="Compartir" onClick={() => compartir(`/compartir/hospital/${i.hospital_id}`, `${i.nombre} — ${i.hospitalNombre}`)}>↗</Button>
                  </div>
                </div>
              ))}
              {insumosVista.length > 80 && (
                <p className="text-xs text-muted-foreground text-center">Mostrando 80 de {insumosVista.length}. Filtra por institución para ver el resto.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detalle de insumo: donaciones + tracking + cambio de estado (reusa el lane de datos). */}
      {insumoOpen && <InsumoDialog id={insumoOpen} onClose={() => setInsumoOpen(null)} onChanged={refrescar} />}
    </div>
  );
}

export default PanelInsumos;
