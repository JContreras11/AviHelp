"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CentroDialog } from "@/components/datos/Detalle";
import { crearHospital, actualizarHospital, eliminarHospital } from "@/app/actions/crud";

const inputCls = "h-11 text-base";
const selCls = "border rounded-lg h-11 px-2 text-base bg-background w-full";

type Hospital = { id?: string; nombre?: string; tipo?: string; ubicacion?: string; contacto?: string; responsable_recepcion_nombre?: string; responsable_recepcion_contacto?: string };

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
      <span className="text-xs rounded-full bg-muted px-2 py-0.5 shrink-0">{h.tipo === "clinica" ? "Clínica" : h.tipo === "refugio" ? "Refugio" : "Hospital"}</span>
    </button>
  );

  return (
    <Tabs value={tab} onValueChange={cambiarTab}>
      <TabsList className="mb-4 max-w-full overflow-x-auto">
        <TabsTrigger value="hospitales">Hospitales / clínicas ({medicas.length})</TabsTrigger>
        <TabsTrigger value="refugios">Refugios ({refugios.length})</TabsTrigger>
        <TabsTrigger value="centros">Centros de acopio ({centros.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="hospitales">
        <div className="flex justify-end mb-3"><Button onClick={() => setHosp({ tipo: "hospital" })}>+ Nuevo hospital / clínica</Button></div>
        <div className="rounded-xl border divide-y">
          {medicas.map(fila)}
          {medicas.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin hospitales.</p>}
        </div>
      </TabsContent>

      <TabsContent value="refugios">
        <div className="flex justify-end mb-3"><Button onClick={() => setHosp({ tipo: "refugio" })}>+ Nuevo refugio</Button></div>
        <div className="rounded-xl border divide-y">
          {refugios.map(fila)}
          {refugios.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin refugios.</p>}
        </div>
      </TabsContent>

      <TabsContent value="centros">
        <div className="flex justify-end mb-3"><Button onClick={() => setCentro({})}>+ Nuevo centro de acopio</Button></div>
        <div className="rounded-xl border divide-y">
          {centros.map((c) => (
            <button key={c.id} onClick={() => setCentro(c)} className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 transition">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.nombre}</p>
                {c.zona && <p className="text-xs text-muted-foreground truncate">📍 {c.zona}</p>}
              </div>
              {!c.activo && <span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5 shrink-0">inactivo</span>}
            </button>
          ))}
          {centros.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin centros.</p>}
        </div>
      </TabsContent>

      {hosp && <HospitalForm h={hosp} onClose={() => setHosp(null)} onSaved={() => { setHosp(null); recargar(); }} />}
      {centro && <CentroDialog centro={centro} onClose={() => setCentro(null)} onChanged={recargar} />}
    </Tabs>
  );
}

function HospitalForm({ h, onClose, onSaved }: { h: Hospital; onClose: () => void; onSaved: () => void }) {
  const nuevo = !h.id;
  const [f, setF] = useState<Hospital>({ tipo: "hospital", ...h });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!f.nombre?.trim()) { toast.error("El nombre es obligatorio."); return; } // no pierde lo escrito
    setGuardando(true);
    const r = nuevo ? await crearHospital(f) : await actualizarHospital(h.id!, f);
    setGuardando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
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
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {!nuevo && <Button variant="destructive" onClick={borrar}>Eliminar</Button>}
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
