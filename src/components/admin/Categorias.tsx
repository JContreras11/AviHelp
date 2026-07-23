"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { crearCategoria, actualizarCategoria, eliminarCategoria } from "@/app/actions/catalogo";

const inputCls = "h-11 text-base";

type Categoria = {
  id?: string;
  nombre?: string;
  descripcion?: string | null;
  orden?: number;
  activo?: boolean;
};

const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export function Categorias({ categorias }: { categorias: Categoria[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Categoria | null>(null);
  const [filtro, setFiltro] = useState("");
  const [, refrescar] = useTransition();
  const recargar = () => refrescar(() => router.refresh());

  // Toggle activo/inactivo directo desde la lista (optimista vía recarga).
  async function toggle(c: Categoria) {
    const r = await actualizarCategoria(c.id!, { activo: !c.activo });
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success(!c.activo ? "Activada." : "Desactivada.");
    recargar();
  }

  const q = norm(filtro).trim();
  const lista = categorias.filter((c) => !q || norm(`${c.nombre ?? ""} ${c.descripcion ?? ""}`).includes(q));

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-3">
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="🔎 Filtrar categorías…"
          className="h-11 text-base sm:max-w-xs"
        />
        <Button onClick={() => setEdit({ activo: true, orden: (categorias.length + 1) })}>+ Nueva categoría</Button>
      </div>

      <div className="rounded-xl border divide-y">
        {lista.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 p-3">
            <button onClick={() => setEdit(c)} className="min-w-0 flex-1 text-left hover:opacity-80 transition">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">#{c.orden ?? 0}</span>
                <p className="font-medium truncate">{c.nombre}</p>
                {!c.activo && <span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5 shrink-0">inactivo</span>}
              </div>
              {c.descripcion && <p className="text-xs text-muted-foreground truncate">{c.descripcion}</p>}
            </button>
            <button
              onClick={() => toggle(c)}
              className="text-xs rounded-full border px-3 py-1 shrink-0 hover:bg-muted transition"
            >
              {c.activo ? "Desactivar" : "Activar"}
            </button>
          </div>
        ))}
        {lista.length === 0 && <p className="p-4 text-sm text-muted-foreground">{q ? "Sin resultados." : "Sin categorías."}</p>}
      </div>

      {edit && <CategoriaForm c={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); recargar(); }} />}
    </div>
  );
}

function CategoriaForm({ c, onClose, onSaved }: { c: Categoria; onClose: () => void; onSaved: () => void }) {
  const nuevo = !c.id;
  const [f, setF] = useState<Categoria>({ activo: true, orden: 0, ...c });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!f.nombre?.trim()) { toast.error("El nombre es obligatorio."); return; }
    setGuardando(true);
    const campos = {
      nombre: f.nombre,
      descripcion: f.descripcion ?? null,
      orden: Number(f.orden) || 0,
      activo: f.activo ?? true,
    };
    const r = nuevo ? await crearCategoria(campos) : await actualizarCategoria(c.id!, campos);
    if (!r.ok) { setGuardando(false); toast.error((r as any).error); return; }
    setGuardando(false);
    toast.success(nuevo ? "Creada." : "Guardada.");
    onSaved();
  }

  async function borrar() {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"? No se puede deshacer.`)) return;
    const r = await eliminarCategoria(c.id!);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Eliminada.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{nuevo ? "Nueva categoría" : f.nombre}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">Nombre
            <Input value={f.nombre ?? ""} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Descripción
            <Input value={f.descripcion ?? ""} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Orden
            <Input
              type="number"
              value={f.orden ?? 0}
              onChange={(e) => setF({ ...f, orden: e.target.value === "" ? 0 : Number(e.target.value) })}
              className={inputCls}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={f.activo ?? true}
              onChange={(e) => setF({ ...f, activo: e.target.checked })}
              className="size-4"
            />
            Activa
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
