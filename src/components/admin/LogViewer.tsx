"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fechaHora } from "@/lib/format";
import { listarLog } from "@/app/actions/audit";

const PAGE = 50;
const ACCION: Record<string, string> = {
  crear: "🟢 creó", editar: "✏️ editó", eliminar: "🗑️ eliminó", tracking: "🚚 tracking",
  cubrir: "✅ cubrió", donar: "🎁 donó", recibir: "📦 recibió", cancelar: "✖️ canceló", password: "🔑 cambió clave",
};
const ENTIDAD: Record<string, string> = {
  insumo: "insumo", persona: "persona", hospital: "hospital", centro: "centro", usuario: "usuario", donacion: "donación", membresia: "membresía",
};

type Row = { id: number; actor_nombre: string | null; accion: string; entidad: string; entidad_id: string | null; detalle: any; created_at: string };

export function LogViewer({ inicial, total }: { inicial: Row[]; total: number }) {
  const [rows, setRows] = useState<Row[]>(inicial);
  const [page, setPage] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [buscarTxt, setBuscarTxt] = useState("");

  const filteredRows = useMemo(() => {
    const q = buscarTxt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!q) return rows;
    return rows.filter((e) => {
      const act = ACCION[e.accion] ?? e.accion;
      const ent = ENTIDAD[e.entidad] ?? e.entidad;
      const detNombre = e.detalle?.nombre ?? "";
      const detEstado = e.detalle?.estado ?? "";
      const detCant = e.detalle?.cantidad != null ? String(e.detalle.cantidad) : "";
      return (
        (e.actor_nombre ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
        act.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
        ent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
        detNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
        detEstado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
        detCant.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
      );
    });
  }, [rows, buscarTxt]);

  async function masResultados() {
    setCargando(true);
    try {
      const { rows: nuevas } = await listarLog(page + 1, PAGE);
      setRows((r) => [...r, ...nuevas as Row[]]);
      setPage((p) => p + 1);
    } catch {
      toast.error("No se pudo cargar más registros. Reintenta.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Filtrar registros por usuario, acción, tipo o detalle…"
        value={buscarTxt}
        onChange={(e) => setBuscarTxt(e.target.value)}
        className="h-10 text-sm"
      />
      <div className="rounded-xl border divide-y">
        {filteredRows.map((e) => (
          <div key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p>
                <span className="font-medium">{e.actor_nombre ?? "—"}</span>{" "}
                {ACCION[e.accion] ?? e.accion} <span className="text-muted-foreground">{ENTIDAD[e.entidad] ?? e.entidad}</span>
                {e.detalle?.nombre ? <span className="text-muted-foreground"> · {e.detalle.nombre}</span> : ""}
                {e.detalle?.estado ? <span className="text-muted-foreground"> · {String(e.detalle.estado).replace("_", " ")}</span> : ""}
                {e.detalle?.cantidad != null ? <span className="text-muted-foreground"> · {e.detalle.cantidad}</span> : ""}
              </p>
            </div>
            <span suppressHydrationWarning className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{fechaHora(e.created_at)}</span>
          </div>
        ))}
        {filteredRows.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {rows.length === 0 ? "Sin registros aún." : "No se encontraron registros que coincidan con la búsqueda."}
          </p>
        )}
      </div>
      {rows.length < total && (
        <Button variant="outline" onClick={masResultados} disabled={cargando}>{cargando ? "Cargando…" : "Cargar más"}</Button>
      )}
    </div>
  );
}
