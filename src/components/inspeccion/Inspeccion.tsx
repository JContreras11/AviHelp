"use client";

import * as React from "react";
import { ClipboardCheck, Loader2, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { inspeccionarItem, personasPorRol } from "@/app/actions/inspeccion";
import { cn } from "@/lib/utils";

// LANE E — Inspección / control de calidad. Cola de items 'por_revisar'; cada uno se abre en
// un modal donde se elige al inspector (rol -> nombre buscable), se corrigen cantidades y
// presentaciones (Nº × unidades = total) y se fija el estatus físico final. Mobile-first.

type Item = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  cantidad?: number | null;
  unidad?: string | null;
  presentacion?: string | null;
  por_presentacion?: number | null;
  cantidad_presentaciones?: number | null;
  vencimiento?: string | null;
  categorias?: { nombre?: string | null } | null;
  centros_acopio?: { nombre?: string | null } | null;
};

const ROL_LABEL: Record<string, string> = {
  admin: "Administrador",
  medico: "Médico",
  voluntario: "Voluntario",
  ong: "ONG",
  publico: "Público",
};
const rolLabel = (r: string) => ROL_LABEL[r] ?? r;

const ESTATUS: { value: "disponible" | "rechazado" | "danado"; label: string; cls: string }[] = [
  { value: "disponible", label: "Disponible", cls: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white data-[on=true]:border-emerald-600" },
  { value: "rechazado", label: "Rechazado", cls: "data-[on=true]:bg-rose-600 data-[on=true]:text-white data-[on=true]:border-rose-600" },
  { value: "danado", label: "Dañado", cls: "data-[on=true]:bg-amber-600 data-[on=true]:text-white data-[on=true]:border-amber-600" },
];

export function Inspeccion({ items, roles }: { items: Item[]; roles: string[] }) {
  const [pendientes, setPendientes] = React.useState<Item[]>(items);
  const [activo, setActivo] = React.useState<Item | null>(null);

  function onDone(id: string) {
    setPendientes((prev) => prev.filter((it) => it.id !== id));
    setActivo(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Por revisar ({pendientes.length})</h2>

      {pendientes.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <PackageCheck className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No hay stock pendiente de inspección.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pendientes.map((it) => (
            <li key={it.id}>
              <div className="rounded-2xl border bg-card p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight truncate">{it.nombre}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {it.categorias?.nombre ? `${it.categorias.nombre} · ` : ""}
                      {fmtCantidad(it)}
                    </p>
                    {(it.centros_acopio?.nombre || it.vencimiento) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {it.centros_acopio?.nombre ? `📍 ${it.centros_acopio.nombre}` : ""}
                        {it.centros_acopio?.nombre && it.vencimiento ? " · " : ""}
                        {it.vencimiento ? `Vence ${it.vencimiento}` : ""}
                      </p>
                    )}
                  </div>
                  <Button size="sm" className="shrink-0" onClick={() => setActivo(it)}>
                    <ClipboardCheck /> Inspeccionar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!activo} onOpenChange={(o) => !o && setActivo(null)}>
        {activo && (
          <DialogContent>
            <InspeccionForm item={activo} roles={roles} onDone={onDone} onCancel={() => setActivo(null)} />
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function fmtCantidad(it: Item) {
  const c = it.cantidad ?? 0;
  const u = it.unidad ? ` ${it.unidad}` : "";
  if (it.cantidad_presentaciones != null && it.por_presentacion != null) {
    const p = it.presentacion ?? "presentaciones";
    return `${it.cantidad_presentaciones} ${p} × ${it.por_presentacion} = ${c}${u}`;
  }
  return `${c}${u}`;
}

function InspeccionForm({
  item, roles, onDone, onCancel,
}: {
  item: Item;
  roles: string[];
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  // Inspector: rol -> persona. Se puede elegir de la lista o escribir un nombre manual.
  const [rol, setRol] = React.useState<string | null>(null);
  const [personas, setPersonas] = React.useState<{ id: string; nombre: string | null; email: string | null }[]>([]);
  const [cargandoPersonas, setCargandoPersonas] = React.useState(false);
  const [extras, setExtras] = React.useState<SearchableOption[]>([]);
  const [personaValue, setPersonaValue] = React.useState<string | null>(null);

  // Campos corregibles del item.
  const [nombre, setNombre] = React.useState(item.nombre ?? "");
  const [unidad, setUnidad] = React.useState(item.unidad ?? "");
  const [presentacion, setPresentacion] = React.useState(item.presentacion ?? "");
  const [nPres, setNPres] = React.useState(item.cantidad_presentaciones != null ? String(item.cantidad_presentaciones) : "");
  const [porPres, setPorPres] = React.useState(item.por_presentacion != null ? String(item.por_presentacion) : "");
  const [cantidad, setCantidad] = React.useState(item.cantidad != null ? String(item.cantidad) : "");

  const [estatus, setEstatus] = React.useState<"disponible" | "rechazado" | "danado">("disponible");
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Al cambiar el rol, carga las personas de ese rol.
  React.useEffect(() => {
    let vivo = true;
    setPersonaValue(null);
    if (!rol) { setPersonas([]); return; }
    setCargandoPersonas(true);
    personasPorRol(rol)
      .then((p) => { if (vivo) setPersonas(p); })
      .finally(() => { if (vivo) setCargandoPersonas(false); });
    return () => { vivo = false; };
  }, [rol]);

  const rolOptions: SearchableOption[] = React.useMemo(
    () => roles.map((r) => ({ value: r, label: rolLabel(r), keywords: r })),
    [roles]
  );

  const personaOptions: SearchableOption[] = React.useMemo(() => {
    const base = personas.map((p) => ({
      value: p.id,
      label: p.nombre || p.email || "Sin nombre",
      keywords: p.email ?? "",
    }));
    return [...base, ...extras];
  }, [personas, extras]);

  const inspectorNombre = React.useMemo(
    () => personaOptions.find((o) => o.value === personaValue)?.label ?? "",
    [personaOptions, personaValue]
  );

  // Total derivado de presentaciones: si hay Nº y unidades c/u, es el producto.
  const nP = parseFloat(nPres);
  const pP = parseFloat(porPres);
  const hayPresentaciones = !Number.isNaN(nP) && !Number.isNaN(pP);
  const total = hayPresentaciones ? nP * pP : null;
  const cantidadFinal = total != null ? total : (cantidad === "" ? 0 : Number(cantidad) || 0);

  async function confirmar() {
    setError(null);
    if (!rol) { setError("Elige el rol del inspector."); return; }
    if (!inspectorNombre.trim()) { setError("Elige o escribe quién inspecciona."); return; }
    if (!nombre.trim()) { setError("El nombre del insumo es obligatorio."); return; }

    setGuardando(true);
    const res = await inspeccionarItem(item.id, {
      inspectorNombre,
      inspectorRol: rol,
      nombre,
      unidad,
      presentacion,
      por_presentacion: porPres,
      cantidad_presentaciones: nPres,
      cantidad,
      estatus,
    });
    setGuardando(false);
    if (!res.ok) { setError(res.error); return; }
    onDone(item.id);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Inspeccionar: {item.nombre}</DialogTitle>
        <DialogDescription>
          Corrige lo recibido, registra quién inspecciona y fija el estatus.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {/* Inspector */}
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">¿Quién inspecciona?</legend>
          <label className="text-sm font-medium">Rol</label>
          <SearchableSelect
            options={rolOptions}
            value={rol}
            onChange={setRol}
            placeholder="Elige un rol…"
          />
          <label className="text-sm font-medium">Persona</label>
          <SearchableSelect
            options={personaOptions}
            value={personaValue}
            onChange={setPersonaValue}
            disabled={!rol}
            placeholder={
              !rol ? "Elige un rol primero"
                : cargandoPersonas ? "Cargando…"
                : "Elige o escribe un nombre…"
            }
            allowCreate
            createLabel={(q) => `Usar “${q}”`}
            onCreate={(q) => {
              const opt = { value: `__manual__:${q}`, label: q };
              setExtras((prev) => [...prev, opt]);
              setPersonaValue(opt.value);
            }}
          />
        </fieldset>

        {/* Correcciones */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Insumo</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del insumo" />
        </div>

        <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Presentación</legend>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Input value={presentacion} onChange={(e) => setPresentacion(e.target.value)} placeholder="paca, caja…" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Unidad base</label>
              <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="kg, unidades…" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground">Nº</label>
              <Input type="number" inputMode="decimal" min="0" value={nPres}
                onChange={(e) => setNPres(e.target.value)} placeholder="0" />
            </div>
            <span className="pb-2.5 text-muted-foreground">×</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground">c/u</label>
              <Input type="number" inputMode="decimal" min="0" value={porPres}
                onChange={(e) => setPorPres(e.target.value)} placeholder="0" />
            </div>
            <span className="pb-2.5 text-muted-foreground">=</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground">Total</label>
              <Input type="number" inputMode="decimal" min="0" value={total != null ? String(total) : cantidad}
                onChange={(e) => setCantidad(e.target.value)} disabled={hayPresentaciones}
                placeholder="0" />
            </div>
          </div>
          {hayPresentaciones && (
            <p className="text-xs text-muted-foreground">
              Total calculado: {nP} × {pP} = {total}{unidad ? ` ${unidad}` : ""}
            </p>
          )}
        </fieldset>

        {/* Estatus */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Resultado</label>
          <div className="grid grid-cols-3 gap-2">
            {ESTATUS.map((e) => (
              <button
                key={e.value}
                type="button"
                data-on={estatus === e.value}
                onClick={() => setEstatus(e.value)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors md:h-9",
                  e.cls
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button onClick={confirmar} disabled={guardando}>
          {guardando && <Loader2 className="animate-spin" />}
          Confirmar ({cantidadFinal}{unidad ? ` ${unidad}` : ""})
        </Button>
      </DialogFooter>
    </>
  );
}

export default Inspeccion;
