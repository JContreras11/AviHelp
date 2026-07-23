"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  crearCuenta, actualizarCuenta, eliminarCuenta,
  crearGasto, eliminarGasto,
} from "@/app/actions/finanzas";

const inputCls = "h-11 text-base";
const selCls = "border rounded-lg h-11 px-2 text-base bg-background w-full";

type Cuenta = {
  id?: string; nombre?: string; banco?: string | null; moneda?: string;
  numero?: string | null; titular?: string | null; saldo_inicial?: number; activo?: boolean;
};
type Mov = {
  id: string; cuenta_id: string | null; tipo: string; concepto: string;
  monto: number; moneda: string; categoria_id: string | null; referencia: string | null; fecha: string;
  cuentas?: { nombre: string; banco: string | null } | null;
  categorias?: { nombre: string } | null;
};
type Cat = { id: string; nombre: string };

const money = (n: number, m: string) =>
  `${m === "VES" ? "Bs " : "$"}${(Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Finanzas({ cuentas, movimientos, categorias }: { cuentas: Cuenta[]; movimientos: Mov[]; categorias: Cat[] }) {
  const router = useRouter();
  const [, refrescar] = useTransition();
  const recargar = () => refrescar(() => router.refresh());

  const [cuentaEdit, setCuentaEdit] = useState<Cuenta | null>(null);
  const [movNuevo, setMovNuevo] = useState<Partial<Mov> | null>(null);

  // Filtros de movimientos (cliente).
  const [fCuenta, setFCuenta] = useState<string | null>(null);
  const [fTipo, setFTipo] = useState<string>("");
  const [fDesde, setFDesde] = useState<string>("");
  const [fHasta, setFHasta] = useState<string>("");

  // Saldo por cuenta = saldo_inicial + Σ ingresos − Σ egresos (calculado en cliente).
  const saldos = useMemo(() => {
    const m = new Map<string, { ingresos: number; egresos: number }>();
    for (const mv of movimientos) {
      if (!mv.cuenta_id) continue;
      const cur = m.get(mv.cuenta_id) ?? { ingresos: 0, egresos: 0 };
      const n = Number(mv.monto) || 0;
      if (mv.tipo === "ingreso") cur.ingresos += n; else if (mv.tipo === "egreso") cur.egresos += n;
      m.set(mv.cuenta_id, cur);
    }
    return m;
  }, [movimientos]);

  const saldoDe = (c: Cuenta) => {
    const s = c.id ? saldos.get(c.id) : undefined;
    return (Number(c.saldo_inicial) || 0) + (s?.ingresos ?? 0) - (s?.egresos ?? 0);
  };

  const movsF = useMemo(() => movimientos.filter((mv) =>
    (!fCuenta || mv.cuenta_id === fCuenta) &&
    (!fTipo || mv.tipo === fTipo) &&
    (!fDesde || mv.fecha >= fDesde) &&
    (!fHasta || mv.fecha <= fHasta)
  ), [movimientos, fCuenta, fTipo, fDesde, fHasta]);

  const cuentaOpts = cuentas.filter((c) => c.id).map((c) => ({ value: c.id!, label: `${c.nombre} (${c.moneda})` }));

  async function borrarMov(mv: Mov) {
    if (!confirm(`¿Eliminar el movimiento "${mv.concepto}"? No se puede deshacer.`)) return;
    const r = await eliminarGasto(mv.id);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Movimiento eliminado."); recargar();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Cuentas ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Cuentas bancarias</h2>
          <Button size="sm" onClick={() => setCuentaEdit({ moneda: "USD", activo: true })}>+ Nueva cuenta</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cuentas.map((c) => (
            <Card key={c.id} className={c.activo === false ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <button onClick={() => setCuentaEdit(c)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.nombre}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.banco || "—"}{c.numero ? ` · ${c.numero}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{c.moneda}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums">{money(saldoDe(c), c.moneda ?? "USD")}</p>
                  <p className="text-xs text-muted-foreground">
                    Inicial {money(Number(c.saldo_inicial) || 0, c.moneda ?? "USD")}
                    {c.activo === false && " · inactiva"}
                  </p>
                </button>
              </CardContent>
            </Card>
          ))}
          {cuentas.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay cuentas. Crea la primera.</p>
          )}
        </div>
      </section>

      {/* ── Movimientos ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Movimientos</h2>
          <Button
            size="sm"
            disabled={cuentas.length === 0}
            onClick={() => setMovNuevo({ tipo: "egreso", moneda: "USD", fecha: new Date().toISOString().slice(0, 10) })}
          >
            + Registrar movimiento
          </Button>
        </div>

        {/* Filtros */}
        <div className="grid gap-2 sm:grid-cols-4 mb-3">
          <SearchableSelect options={cuentaOpts} value={fCuenta} onChange={setFCuenta} placeholder="Todas las cuentas" />
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={selCls}>
            <option value="">Ingresos y egresos</option>
            <option value="ingreso">Solo ingresos</option>
            <option value="egreso">Solo egresos</option>
          </select>
          <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className={inputCls} aria-label="Desde" />
          <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className={inputCls} aria-label="Hasta" />
        </div>

        <div className="rounded-xl border divide-y">
          {movsF.map((mv) => (
            <div key={mv.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={mv.tipo === "ingreso" ? "secondary" : "destructive"}>
                    {mv.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                  </Badge>
                  <p className="font-medium truncate">{mv.concepto}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {mv.fecha}
                  {mv.cuentas?.nombre ? ` · ${mv.cuentas.nombre}` : ""}
                  {mv.categorias?.nombre ? ` · ${mv.categorias.nombre}` : ""}
                  {mv.referencia ? ` · ref ${mv.referencia}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-semibold tabular-nums ${mv.tipo === "ingreso" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {mv.tipo === "ingreso" ? "+" : "−"}{money(mv.monto, mv.moneda)}
                </span>
                <button onClick={() => borrarMov(mv)} aria-label="Eliminar" className="text-xs text-muted-foreground hover:text-destructive px-1">✕</button>
              </div>
            </div>
          ))}
          {movsF.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {movimientos.length === 0 ? "Aún no hay movimientos." : "Sin resultados para el filtro."}
            </p>
          )}
        </div>
      </section>

      {cuentaEdit && (
        <CuentaForm c={cuentaEdit} onClose={() => setCuentaEdit(null)} onSaved={() => { setCuentaEdit(null); recargar(); }} />
      )}
      {movNuevo && (
        <MovForm base={movNuevo} cuentas={cuentas} categorias={categorias} onClose={() => setMovNuevo(null)} onSaved={() => { setMovNuevo(null); recargar(); }} />
      )}
    </div>
  );
}

function CuentaForm({ c, onClose, onSaved }: { c: Cuenta; onClose: () => void; onSaved: () => void }) {
  const nuevo = !c.id;
  const [f, setF] = useState<Cuenta>({ moneda: "USD", activo: true, saldo_inicial: 0, ...c });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!f.nombre?.trim()) { toast.error("El nombre es obligatorio."); return; }
    setGuardando(true);
    const r = nuevo ? await crearCuenta(f) : await actualizarCuenta(c.id!, f);
    setGuardando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success(nuevo ? "Cuenta creada." : "Guardado.");
    onSaved();
  }

  async function borrar() {
    if (!confirm(`¿Eliminar la cuenta ${c.nombre}? Los movimientos quedan sin cuenta. No se puede deshacer.`)) return;
    const r = await eliminarCuenta(c.id!);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Cuenta eliminada."); onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{nuevo ? "Nueva cuenta" : f.nombre}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">Nombre
            <Input value={f.nombre ?? ""} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={inputCls} placeholder="Ej. Bank of America – Operaciones" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Banco
            <Input value={f.banco ?? ""} onChange={(e) => setF({ ...f, banco: e.target.value })} className={inputCls} placeholder="Bank of America" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Moneda
              <select value={f.moneda ?? "USD"} onChange={(e) => setF({ ...f, moneda: e.target.value })} className={selCls}>
                <option value="USD">USD</option>
                <option value="VES">VES</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Saldo inicial
              <Input type="number" step="0.01" value={f.saldo_inicial ?? 0} onChange={(e) => setF({ ...f, saldo_inicial: e.target.value as any })} className={inputCls} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">Nº de cuenta
            <Input value={f.numero ?? ""} onChange={(e) => setF({ ...f, numero: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Titular
            <Input value={f.titular ?? ""} onChange={(e) => setF({ ...f, titular: e.target.value })} className={inputCls} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={f.activo !== false} onChange={(e) => setF({ ...f, activo: e.target.checked })} className="size-4" />
            Cuenta activa
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

function MovForm({ base, cuentas, categorias, onClose, onSaved }: {
  base: Partial<Mov>; cuentas: Cuenta[]; categorias: Cat[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Mov>>({ ...base });
  const [guardando, setGuardando] = useState(false);

  const cuentaOpts = cuentas.filter((c) => c.id).map((c) => ({ value: c.id!, label: `${c.nombre} (${c.moneda})` }));
  const catOpts = categorias.map((c) => ({ value: c.id, label: c.nombre }));

  // Al elegir cuenta, hereda su moneda por defecto (editable).
  function setCuenta(id: string | null) {
    const c = cuentas.find((x) => x.id === id);
    setF((p) => ({ ...p, cuenta_id: id, moneda: c?.moneda ?? p.moneda }));
  }

  async function guardar() {
    if (!f.concepto?.trim()) { toast.error("El concepto es obligatorio."); return; }
    if (!(Number(f.monto) > 0)) { toast.error("El monto debe ser mayor a 0."); return; }
    setGuardando(true);
    const r = await crearGasto(f);
    setGuardando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Movimiento registrado."); onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nuevo movimiento</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">Tipo
            <select value={f.tipo ?? "egreso"} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={selCls}>
              <option value="egreso">Egreso (gasto)</option>
              <option value="ingreso">Ingreso (donación / abono)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Concepto
            <Input value={f.concepto ?? ""} onChange={(e) => setF({ ...f, concepto: e.target.value })} className={inputCls} placeholder="Ej. Compra de carpas" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Monto
              <Input type="number" step="0.01" value={f.monto ?? ""} onChange={(e) => setF({ ...f, monto: e.target.value as any })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Moneda
              <select value={f.moneda ?? "USD"} onChange={(e) => setF({ ...f, moneda: e.target.value })} className={selCls}>
                <option value="USD">USD</option>
                <option value="VES">VES</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">Cuenta
            <SearchableSelect options={cuentaOpts} value={f.cuenta_id ?? null} onChange={setCuenta} placeholder="Selecciona cuenta…" />
          </label>
          {catOpts.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">Categoría
              <SearchableSelect options={catOpts} value={f.categoria_id ?? null} onChange={(v) => setF({ ...f, categoria_id: v })} placeholder="Sin categoría" />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Fecha
              <Input type="date" value={f.fecha ?? ""} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Referencia
              <Input value={f.referencia ?? ""} onChange={(e) => setF({ ...f, referencia: e.target.value })} className={inputCls} placeholder="Nº transacción" />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
