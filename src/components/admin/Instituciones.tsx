"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CentroDialog } from "@/components/datos/Detalle";
import { crearHospital, actualizarHospital, eliminarHospital, getRelacionesHospitalRefugio, setRelacionesHospitalRefugio } from "@/app/actions/crud";
import { zonaDe } from "@/lib/zona";

const inputCls = "h-11 text-base";
const selCls = "border rounded-lg h-11 px-2 text-base bg-background w-full";

type Hospital = { id?: string; nombre?: string; tipo?: string; ubicacion?: string; contacto?: string; responsable_recepcion_nombre?: string; responsable_recepcion_contacto?: string; gps_lat?: number | null; gps_lng?: number | null };

// Agrupa por zona (derivada on-read); zonas con más items primero, "Otra zona" al final.
function porZona(items: Hospital[]): [string, Hospital[]][] {
  const map = new Map<string, Hospital[]>();
  for (const h of items) {
    const z = zonaDe(h);
    (map.get(z) ?? map.set(z, []).get(z)!).push(h);
  }
  return [...map.entries()].sort((a, b) =>
    a[0] === "Otra zona" ? 1 : b[0] === "Otra zona" ? -1 : b[1].length - a[1].length);
}

export function Instituciones({ hospitales, centros }: { hospitales: Hospital[]; centros: any[] }) {
  const router = useRouter();
  const [hosp, setHosp] = useState<Hospital | null>(null);
  const [centro, setCentro] = useState<any | null>(null);
  const [, refrescar] = useTransition();
  const recargar = () => refrescar(() => router.refresh());

  // Separa refugios de hospitales/clínicas (todos viven en la tabla hospitales por tipo).
  const medicas = hospitales.filter((h) => h.tipo !== "refugio");
  const refugios = hospitales.filter((h) => h.tipo === "refugio");

  // Mantiene el tab activo en el hash de la URL (#hospitales/#refugios/#centros) al recargar.
  const TABS = ["hospitales", "refugios", "centros"];
  const [tab, setTab] = useState("hospitales");
  const [filtro, setFiltro] = useState("");
  useEffect(() => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (TABS.includes(h)) setTab(h);
  }, []);
  function cambiarTab(v: string) {
    setTab(v);
    if (typeof window !== "undefined") history.replaceState(null, "", `#${v}`);
  }

  const fila = (h: Hospital) => (
    <button key={h.id} onClick={() => setHosp(h)} className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 transition">
      <div className="min-w-0">
        <p className="font-medium truncate">{h.nombre}</p>
        {h.ubicacion && <p className="text-xs text-muted-foreground truncate">{h.ubicacion}</p>}
      </div>
      <span className="text-xs rounded-full bg-muted px-2 py-0.5 shrink-0">{h.tipo === "clinica" ? "Clínica" : h.tipo === "refugio" ? "Refugio" : h.tipo === "centro" ? "Centro de acopio" : "Hospital"}</span>
    </button>
  );

  // Filtro por texto (regla de oro: toda lista se puede filtrar). Aplica a la pestaña activa.
  const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = norm(filtro).trim();
  const coincide = (x: any) => !q || norm(`${x?.nombre ?? ""} ${x?.ubicacion ?? ""} ${x?.zona ?? ""}`).includes(q);
  const medicasF = medicas.filter(coincide);
  const refugiosF = refugios.filter(coincide);
  const centrosF = centros.filter(coincide);

  // Lista agrupada por zona con encabezados (una sola zona → sin encabezado, evita ruido).
  const listaAgrupada = (items: Hospital[]) => {
    const grupos = porZona(items);
    if (grupos.length <= 1) return items.map(fila);
    return grupos.map(([zona, hs]) => (
      <div key={zona}>
        <p className="sticky top-0 bg-muted/60 backdrop-blur px-3 py-1 text-xs font-semibold text-muted-foreground">📍 {zona} ({hs.length})</p>
        {hs.map(fila)}
      </div>
    ));
  };

  return (
    <Tabs value={tab} onValueChange={cambiarTab}>
      <TabsList className="mb-4 max-w-full overflow-x-auto">
        <TabsTrigger value="hospitales">Hospitales / clínicas ({medicas.length})</TabsTrigger>
        <TabsTrigger value="refugios">Refugios ({refugios.length})</TabsTrigger>
        <TabsTrigger value="centros">Centros de acopio ({centros.length})</TabsTrigger>
      </TabsList>

      <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="🔎 Filtrar por nombre, zona o ubicación…" className="mb-3 h-11 text-base" />

      <TabsContent value="hospitales">
        <div className="flex justify-end mb-3"><Button onClick={() => setHosp({ tipo: "hospital" })}>+ Nuevo hospital / clínica</Button></div>
        <div className="rounded-xl border divide-y">
          {listaAgrupada(medicasF)}
          {medicasF.length === 0 && <p className="p-4 text-sm text-muted-foreground">{q ? "Sin resultados." : "Sin hospitales."}</p>}
        </div>
      </TabsContent>

      <TabsContent value="refugios">
        <div className="flex justify-end mb-3"><Button onClick={() => setHosp({ tipo: "refugio" })}>+ Nuevo refugio</Button></div>
        <div className="rounded-xl border divide-y">
          {listaAgrupada(refugiosF)}
          {refugiosF.length === 0 && <p className="p-4 text-sm text-muted-foreground">{q ? "Sin resultados." : "Sin refugios."}</p>}
        </div>
      </TabsContent>

      <TabsContent value="centros">
        <div className="flex justify-end mb-3"><Button onClick={() => setCentro({})}>+ Nuevo centro de acopio</Button></div>
        <div className="rounded-xl border divide-y">
          {centrosF.map((c) => (
            <button key={c.id} onClick={() => setCentro(c)} className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 transition">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.nombre}</p>
                {c.zona && <p className="text-xs text-muted-foreground truncate">📍 {c.zona}</p>}
              </div>
              {!c.activo && <span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5 shrink-0">inactivo</span>}
            </button>
          ))}
          {centrosF.length === 0 && <p className="p-4 text-sm text-muted-foreground">{q ? "Sin resultados." : "Sin centros."}</p>}
        </div>
      </TabsContent>

      {hosp && <HospitalForm h={hosp} hospitales={hospitales} onClose={() => setHosp(null)} onSaved={() => { setHosp(null); recargar(); }} />}
      {centro && <CentroDialog centro={centro} onClose={() => setCentro(null)} onChanged={recargar} />}
    </Tabs>
  );
}

function HospitalForm({ h, hospitales, onClose, onSaved }: { h: Hospital; hospitales: Hospital[]; onClose: () => void; onSaved: () => void }) {
  const nuevo = !h.id;
  const [f, setF] = useState<Hospital>({ tipo: "hospital", ...h });
  const [guardando, setGuardando] = useState(false);

  // Mapeos de hospital ↔ refugio
  const isRefugio = f.tipo === "refugio";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cargandoRel, setCargandoRel] = useState(false);
  const [buscarTxt, setBuscarTxt] = useState("");

  useEffect(() => {
    if (nuevo) return;
    setCargandoRel(true);
    getRelacionesHospitalRefugio(h.id!, isRefugio)
      .then((ids) => setSelectedIds(new Set(ids)))
      .catch(() => toast.error("Error al cargar relaciones."))
      .finally(() => setCargandoRel(false));
  }, [nuevo, h.id, isRefugio]);

  const opcionesRelacionables = useMemo(() => {
    return hospitales.filter((x) => x.id !== h.id && (isRefugio ? x.tipo !== "refugio" : x.tipo === "refugio"));
  }, [hospitales, h.id, isRefugio]);

  const filteredOpciones = useMemo(() => {
    const q = buscarTxt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return opcionesRelacionables.filter(o =>
      (o.nombre ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [opcionesRelacionables, buscarTxt]);

  const toggleRel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = useMemo(() => {
    if (filteredOpciones.length === 0) return false;
    return filteredOpciones.every(o => selectedIds.has(o.id!));
  }, [filteredOpciones, selectedIds]);

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredOpciones.forEach(o => next.delete(o.id!));
      } else {
        filteredOpciones.forEach(o => next.add(o.id!));
      }
      return next;
    });
  };

  async function guardar() {
    if (!f.nombre?.trim()) { toast.error("El nombre es obligatorio."); return; }
    setGuardando(true);
    const r = nuevo ? await crearHospital(f) : await actualizarHospital(h.id!, f);
    if (!r.ok) { setGuardando(false); toast.error((r as any).error); return; }

    const targetId = h.id || r.hospital?.id;
    if (targetId) {
      const r2 = await setRelacionesHospitalRefugio(targetId, [...selectedIds], isRefugio);
      if (!r2.ok) {
        setGuardando(false);
        toast.error("Error al guardar las relaciones: " + r2.error);
        return;
      }
    }

    setGuardando(false);
    toast.success(nuevo ? "Creado." : "Guardado.");
    onSaved();
  }

  async function borrar() {
    if (!confirm(`¿Eliminar ${h.nombre}? Se borran sus insumos. No se puede deshacer.`)) return;
    const r = await eliminarHospital(h.id!);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Eliminado.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{nuevo ? (f.tipo === "refugio" ? "Nuevo refugio" : "Nuevo hospital / clínica") : f.nombre}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">Nombre
            <Input value={f.nombre ?? ""} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Tipo
            <select value={f.tipo ?? "hospital"} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={selCls}>
              <option value="hospital">Hospital</option>
              <option value="clinica">Clínica</option>
              <option value="refugio">Refugio</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Ubicación
            <Input value={f.ubicacion ?? ""} onChange={(e) => setF({ ...f, ubicacion: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Contacto
            <Input value={f.contacto ?? ""} onChange={(e) => setF({ ...f, contacto: e.target.value })} className={inputCls} />
          </label>

          <div className="border-t pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {isRefugio ? "Hospitales / clínicas cercanos" : "Refugios vinculados"}
              </p>
              {filteredOpciones.length > 0 && (
                <button type="button" onClick={toggleAll} className="text-xs text-primary underline hover:opacity-85">
                  {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
                </button>
              )}
            </div>
            <Input
              placeholder="Filtrar por nombre…"
              value={buscarTxt}
              onChange={(e) => setBuscarTxt(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="max-h-36 overflow-auto rounded-lg border divide-y text-sm">
              {cargandoRel && <p className="p-2 text-xs text-muted-foreground">Cargando relaciones…</p>}
              {!cargandoRel && filteredOpciones.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">No se encontraron centros.</p>
              )}
              {!cargandoRel && filteredOpciones.map((o) => (
                <label key={o.id} className="flex items-center gap-2 p-2 hover:bg-muted/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(o.id!)}
                    onChange={() => toggleRel(o.id!)}
                    className="size-4"
                  />
                  <span className="truncate">
                    {o.tipo === "refugio" ? "📦" : "🏥"} {o.nombre}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {!nuevo && <Button variant="destructive" onClick={borrar}>Eliminar</Button>}
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
