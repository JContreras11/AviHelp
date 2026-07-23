"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ESTATUS_INVENTARIO, crearItem, actualizarItem, eliminarItem, cambiarEstatus,
} from "@/app/actions/inventario";

type Cat = { id: string; nombre: string };
type Item = {
  id: string; categoria_id: string | null; centro_id: string | null; nombre: string;
  descripcion: string | null; cantidad: number | null; unidad: string | null;
  presentacion: string | null; por_presentacion: number | null; cantidad_presentaciones: number | null;
  estatus: string; vencimiento: string | null;
  categorias?: { nombre: string } | null; centros_acopio?: { nombre: string } | null;
};

// Etiqueta + estilo de cada estatus (badge). Mantiene el orden del CHECK de la migración.
const ESTATUS_META: Record<string, { label: string; variant: any }> = {
  por_revisar: { label: "Por revisar", variant: "secondary" },
  rechazado: { label: "Rechazado", variant: "destructive" },
  danado: { label: "Dañado", variant: "destructive" },
  disponible: { label: "Disponible", variant: "default" },
  en_entrega: { label: "En entrega", variant: "outline" },
  entregado: { label: "Entregado", variant: "ghost" },
};
const estatusOpciones = ESTATUS_INVENTARIO.map((e) => ({ value: e, label: ESTATUS_META[e].label }));

const inputCls = "h-11 text-base";
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Total en unidades base a partir de la presentación anidada (ej. 18 cajas × 100 = 1800).
function totalDesdePresentacion(porPres: any, nPres: any): number | null {
  const a = Number(porPres), b = Number(nPres);
  if (!porPres || !nPres || Number.isNaN(a) || Number.isNaN(b)) return null;
  return a * b;
}

export function Inventario({ items, categorias, centros }: { items: Item[]; categorias: Cat[]; centros: Cat[] }) {
  const router = useRouter();
  const [, refrescar] = useTransition();
  const recargar = () => refrescar(() => router.refresh());

  const [q, setQ] = useState("");
  const [catFiltro, setCatFiltro] = useState<string | null>(null);
  const [estatusFiltro, setEstatusFiltro] = useState<string | null>(null);
  const [editar, setEditar] = useState<Partial<Item> | null>(null);

  const catOpciones = useMemo(() => categorias.map((c) => ({ value: c.id, label: c.nombre })), [categorias]);

  const filtrados = useMemo(() => {
    const t = norm(q).trim();
    return items.filter((it) => {
      if (catFiltro && it.categoria_id !== catFiltro) return false;
      if (estatusFiltro && it.estatus !== estatusFiltro) return false;
      if (t && !norm(`${it.nombre} ${it.descripcion ?? ""} ${it.categorias?.nombre ?? ""}`).includes(t)) return false;
      return true;
    });
  }, [items, q, catFiltro, estatusFiltro]);

  const filtroActivoTxt = useMemo(() => {
    const p: string[] = [];
    if (q.trim()) p.push(`búsqueda "${q.trim()}"`);
    if (catFiltro) p.push(`categoría ${categorias.find((c) => c.id === catFiltro)?.nombre ?? ""}`);
    if (estatusFiltro) p.push(`estatus ${ESTATUS_META[estatusFiltro]?.label ?? estatusFiltro}`);
    return p.length ? p.join(" · ") : "sin filtros";
  }, [q, catFiltro, estatusFiltro, categorias]);

  async function quickEstatus(it: Item, estatus: string | null) {
    if (!estatus || estatus === it.estatus) return;
    const r = await cambiarEstatus(it.id, estatus);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Estatus actualizado.");
    recargar();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controles — mobile-first, se apilan en móvil. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center print:hidden">
        <Input value={q} onChange={(e) => setQ(e.target.value)} type="search"
          placeholder="🔎 Buscar por nombre, descripción…" className="h-11 text-base sm:flex-1" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <div className="min-w-0 sm:w-48">
            <SearchableSelect options={catOpciones} value={catFiltro} onChange={setCatFiltro} placeholder="Categoría — todas" />
          </div>
          <div className="min-w-0 sm:w-44">
            <SearchableSelect options={estatusOpciones} value={estatusFiltro} onChange={setEstatusFiltro} placeholder="Estatus — todos" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {filtrados.length} {filtrados.length === 1 ? "artículo" : "artículos"}{q || catFiltro || estatusFiltro ? " (filtrado)" : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" onClick={() => window.print()}>🖨️ Imprimir</Button>
          <Button size="lg" onClick={() => setEditar({ estatus: "por_revisar" })}>+ Nuevo</Button>
        </div>
      </div>

      {/* TABLA (escritorio) */}
      <div className="hidden md:block overflow-x-auto rounded-xl border print:hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Artículo</th>
              <th className="p-2 font-medium">Categoría</th>
              <th className="p-2 font-medium">Cantidad</th>
              <th className="p-2 font-medium">Presentación</th>
              <th className="p-2 font-medium">Vence</th>
              <th className="p-2 font-medium">Estatus</th>
              <th className="p-2 font-medium text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtrados.map((it) => (
              <tr key={it.id} className="hover:bg-muted/30">
                <td className="p-2">
                  <p className="font-medium">{it.nombre}</p>
                  {it.descripcion && <p className="text-xs text-muted-foreground line-clamp-1">{it.descripcion}</p>}
                </td>
                <td className="p-2 text-muted-foreground">{it.categorias?.nombre ?? "—"}</td>
                <td className="p-2 whitespace-nowrap">{it.cantidad ?? 0} {it.unidad ?? ""}</td>
                <td className="p-2 text-muted-foreground whitespace-nowrap">
                  {it.presentacion
                    ? `${it.cantidad_presentaciones ?? "?"} ${it.presentacion}${it.por_presentacion ? ` × ${it.por_presentacion}` : ""}`
                    : "—"}
                </td>
                <td className="p-2 text-muted-foreground whitespace-nowrap">{it.vencimiento ?? "—"}</td>
                <td className="p-2 min-w-40">
                  <SearchableSelect options={estatusOpciones} value={it.estatus}
                    onChange={(v) => quickEstatus(it, v)} placeholder="Estatus" />
                </td>
                <td className="p-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditar(it)}>Editar</Button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                {items.length === 0 ? "Aún no hay stock registrado." : "Sin resultados con estos filtros."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* TARJETAS (móvil) */}
      <div className="md:hidden flex flex-col gap-2 print:hidden">
        {filtrados.map((it) => (
          <div key={it.id} className="rounded-xl border bg-card p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium leading-tight">{it.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {it.categorias?.nombre ?? "Sin categoría"} · {it.cantidad ?? 0} {it.unidad ?? ""}
                </p>
              </div>
              <Badge variant={ESTATUS_META[it.estatus]?.variant ?? "secondary"}>{ESTATUS_META[it.estatus]?.label ?? it.estatus}</Badge>
            </div>
            {it.presentacion && (
              <p className="text-xs text-muted-foreground">
                {it.cantidad_presentaciones ?? "?"} {it.presentacion}{it.por_presentacion ? ` × ${it.por_presentacion}` : ""}
                {it.vencimiento ? ` · vence ${it.vencimiento}` : ""}
              </p>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1"><SearchableSelect options={estatusOpciones} value={it.estatus} onChange={(v) => quickEstatus(it, v)} placeholder="Estatus" /></div>
              <Button variant="outline" size="lg" onClick={() => setEditar(it)}>Editar</Button>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground rounded-xl border">
            {items.length === 0 ? "Aún no hay stock registrado." : "Sin resultados con estos filtros."}
          </p>
        )}
      </div>

      {/* VISTA DE IMPRESIÓN — oculta en pantalla, visible al imprimir. */}
      <div className="hidden print:block">
        <h2 className="text-lg font-bold">Inventario de stock — AviHelp</h2>
        <p className="text-xs">
          Impreso el {new Date().toLocaleString("es-VE")} · Filtro: {filtroActivoTxt} · {filtrados.length} artículos
        </p>
        <table className="w-full text-xs mt-3 border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-1">Artículo</th>
              <th className="text-left p-1">Categoría</th>
              <th className="text-left p-1">Cantidad</th>
              <th className="text-left p-1">Presentación</th>
              <th className="text-left p-1">Vence</th>
              <th className="text-left p-1">Estatus</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="p-1">{it.nombre}</td>
                <td className="p-1">{it.categorias?.nombre ?? "—"}</td>
                <td className="p-1">{it.cantidad ?? 0} {it.unidad ?? ""}</td>
                <td className="p-1">{it.presentacion ? `${it.cantidad_presentaciones ?? "?"} ${it.presentacion}${it.por_presentacion ? ` × ${it.por_presentacion}` : ""}` : "—"}</td>
                <td className="p-1">{it.vencimiento ?? "—"}</td>
                <td className="p-1">{ESTATUS_META[it.estatus]?.label ?? it.estatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editar && (
        <ItemForm item={editar} categorias={categorias} centros={centros}
          onClose={() => setEditar(null)} onSaved={() => { setEditar(null); recargar(); }} />
      )}
    </div>
  );
}

function ItemForm({ item, categorias, centros, onClose, onSaved }: {
  item: Partial<Item>; categorias: Cat[]; centros: Cat[]; onClose: () => void; onSaved: () => void;
}) {
  const nuevo = !item.id;
  const [f, setF] = useState<Partial<Item>>({ estatus: "por_revisar", ...item });
  const [guardando, setGuardando] = useState(false);

  const catOpciones = categorias.map((c) => ({ value: c.id, label: c.nombre }));
  const centroOpciones = centros.map((c) => ({ value: c.id, label: c.nombre }));
  const set = (k: keyof Item, v: any) => setF((p) => ({ ...p, [k]: v }));

  const totalPres = totalDesdePresentacion(f.por_presentacion, f.cantidad_presentaciones);

  async function guardar() {
    if (!f.nombre?.trim()) { toast.error("El nombre es obligatorio."); return; }
    setGuardando(true);
    const r = nuevo ? await crearItem(f) : await actualizarItem(item.id!, f);
    if (!r.ok) { setGuardando(false); toast.error((r as any).error); return; }
    toast.success(nuevo ? "Creado." : "Guardado.");
    onSaved();
  }

  async function borrar() {
    if (!confirm(`¿Eliminar "${f.nombre}"? No se puede deshacer.`)) return;
    const r = await eliminarItem(item.id!);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Eliminado.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{nuevo ? "Nuevo artículo" : f.nombre}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">Nombre
            <Input value={f.nombre ?? ""} onChange={(e) => set("nombre", e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Descripción
            <Textarea value={f.descripcion ?? ""} onChange={(e) => set("descripcion", e.target.value)} rows={2} />
          </label>
          <div className="flex flex-col gap-1 text-sm font-medium">Categoría
            <SearchableSelect options={catOpciones} value={f.categoria_id ?? null} onChange={(v) => set("categoria_id", v)} placeholder="Sin categoría" />
          </div>
          <div className="flex flex-col gap-1 text-sm font-medium">Centro de acopio
            <SearchableSelect options={centroOpciones} value={f.centro_id ?? null} onChange={(v) => set("centro_id", v)} placeholder="Sin centro" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Cantidad (total)
              <Input type="number" inputMode="decimal" value={f.cantidad ?? ""} onChange={(e) => set("cantidad", e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Unidad
              <Input value={f.unidad ?? ""} onChange={(e) => set("unidad", e.target.value)} placeholder="unidades, kg, ml" className={inputCls} />
            </label>
          </div>

          <fieldset className="border rounded-lg p-3 flex flex-col gap-3">
            <legend className="text-xs font-medium text-muted-foreground px-1">Presentación anidada (opcional)</legend>
            <label className="flex flex-col gap-1 text-sm font-medium">Presentación
              <Input value={f.presentacion ?? ""} onChange={(e) => set("presentacion", e.target.value)} placeholder="paca, caja, frasco" className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">Nº presentaciones
                <Input type="number" inputMode="decimal" value={f.cantidad_presentaciones ?? ""} onChange={(e) => set("cantidad_presentaciones", e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Unidades c/u
                <Input type="number" inputMode="decimal" value={f.por_presentacion ?? ""} onChange={(e) => set("por_presentacion", e.target.value)} className={inputCls} />
              </label>
            </div>
            {totalPres != null && (
              <p className="text-xs text-muted-foreground">
                = {totalPres} unidades base.{" "}
                <button type="button" className="text-primary underline" onClick={() => set("cantidad", totalPres)}>Usar como cantidad total</button>
              </p>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 text-sm font-medium">Estatus
              <SearchableSelect options={estatusOpciones} value={f.estatus ?? "por_revisar"} onChange={(v) => set("estatus", v ?? "por_revisar")} placeholder="Estatus" />
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">Vencimiento
              <Input type="date" value={f.vencimiento ?? ""} onChange={(e) => set("vencimiento", e.target.value)} className={inputCls} />
            </label>
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
