"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DonarBoton, presentacionDe, type InsumoDonable } from "@/components/DonarInsumo";
import { actualizarEstadoSolicitud } from "@/app/actions/solicitudes";

type Need = InsumoDonable & {
  area: string | null; prioridad: string | null; estado: string;
  cantidad_en_camino?: number; cantidad_recibida?: number;
};
type Sol = {
  id: string; slug: string; titulo: string; descripcion: string | null; estado: string;
  fuente: string; origen_url: string | null; hospital_id: string | null;
  hospitales?: { nombre: string; ubicacion: string | null } | null;
  insumos: Need[]; puedeGestionar: boolean; updated_at: string;
};

const ESTADO_SOL: Record<string, { label: string; cls: string }> = {
  abierta: { label: "Abierta", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  en_progreso: { label: "En progreso", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" },
  cubierta: { label: "Cubierta", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  cerrada: { label: "Cerrada", cls: "bg-muted text-muted-foreground" },
};
const ESTADO_NEED: Record<string, { label: string; cls: string }> = {
  solicitado: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  en_transito: { label: "En camino", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" },
  cubierto: { label: "Cubierto", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  entregado: { label: "Entregado", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground line-through" },
};
const PRIOR_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

export function SolicitudPublica({ sol }: { sol: Sol }) {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState(sol.estado);
  const [guardando, setGuardando] = useState(false);

  const needs = useMemo(() => {
    const t = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const list = [...sol.insumos].sort((a, b) =>
      (PRIOR_ORDER[a.prioridad ?? "media"] ?? 2) - (PRIOR_ORDER[b.prioridad ?? "media"] ?? 2));
    if (!t) return list;
    return list.filter((i) =>
      [i.nombre, i.area, i.hospitales?.nombre].filter(Boolean).join(" ")
        .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(t));
  }, [sol.insumos, q]);

  const totales = useMemo(() => {
    const total = sol.insumos.filter((i) => i.estado !== "cancelado").length;
    const cub = sol.insumos.filter((i) => i.estado === "cubierto" || i.estado === "entregado").length;
    return { total, cub, pct: total ? Math.round((cub / total) * 100) : 0 };
  }, [sol.insumos]);

  const url = typeof window !== "undefined" ? window.location.href : `https://avihelp.app/solicitud/${sol.slug}`;
  const compartir = async () => {
    const texto = `🆘 ${sol.titulo} — ayúdanos a cubrir estas necesidades médicas:`;
    if (navigator.share) { try { await navigator.share({ title: sol.titulo, text: texto, url }); return; } catch { /* cancelado */ } }
    try { await navigator.clipboard.writeText(url); toast.success("Enlace copiado. ¡Compártelo!"); } catch { toast.error("No se pudo copiar el enlace."); }
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`🆘 ${sol.titulo}\nAyúdanos a cubrir estas necesidades médicas: ${url}`)}`;

  async function cambiarEstado(nuevo: string) {
    setGuardando(true);
    const r = await actualizarEstadoSolicitud(sol.id, nuevo as any);
    setGuardando(false);
    if (!r.ok) { toast.error(r.error ?? "No se pudo actualizar."); return; }
    setEstado(nuevo);
    toast.success("Estado actualizado.");
  }

  const est = ESTADO_SOL[estado] ?? ESTADO_SOL.abierta;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 flex flex-col gap-5">
      {/* Encabezado */}
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight break-words">{sol.titulo}</h1>
            {sol.hospitales?.nombre && (
              <p className="text-sm text-muted-foreground mt-1">🏥 {sol.hospitales.nombre}{sol.hospitales.ubicacion ? ` · ${sol.hospitales.ubicacion}` : ""}</p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${est.cls}`}>{est.label}</span>
        </div>
        {sol.descripcion && <p className="text-base text-foreground/90">{sol.descripcion}</p>}

        {/* Progreso */}
        {totales.total > 0 && (
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium">{totales.cub} de {totales.total} cubiertas</span>
              <span className="text-muted-foreground">{totales.pct}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${totales.pct}%` }} />
            </div>
          </div>
        )}

        {/* Compartir */}
        <div className="flex flex-wrap gap-2">
          <Button size="lg" variant="outline" className="flex-1 min-w-[8rem] text-base" onClick={compartir}>🔗 Compartir</Button>
          <a href={whatsapp} target="_blank" rel="noreferrer" className="flex-1 min-w-[8rem]">
            <Button size="lg" variant="outline" className="w-full text-base">💬 WhatsApp</Button>
          </a>
        </div>
      </header>

      {/* Gestión de estado (solo quien gestiona el centro) */}
      {sol.puedeGestionar && (
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-sm font-semibold mb-2">Gestionar estado de la solicitud</p>
          <div className="flex flex-wrap gap-2">
            {(["abierta", "en_progreso", "cubierta", "cerrada"] as const).map((e) => (
              <Button key={e} size="sm" variant={estado === e ? "default" : "outline"} disabled={guardando || estado === e}
                onClick={() => cambiarEstado(e)}>{ESTADO_SOL[e].label}</Button>
            ))}
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Necesidades ({sol.insumos.length})</h2>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Buscar una necesidad…" className="h-11 text-base" />
      </div>

      {/* Lista de necesidades con botón Donar */}
      <ul className="flex flex-col gap-2.5">
        {needs.map((it) => {
          const en = ESTADO_NEED[it.estado] ?? ESTADO_NEED.solicitado;
          const cubierto = it.estado === "cubierto" || it.estado === "entregado" || it.estado === "cancelado";
          const pres = presentacionDe(it);
          return (
            <li key={it.id} className="rounded-2xl border bg-card p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold capitalize leading-tight">{it.nombre}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${en.cls}`}>{en.label}</span>
                  {(it.prioridad === "critica" || it.prioridad === "alta") && (
                    <Badge variant="destructive" className="text-[11px]">{it.prioridad === "critica" ? "🔴 Crítico" : "🟠 Alta"}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {it.cantidad != null ? `${it.cantidad}${pres ? ` ${pres}` : it.unidad ? ` ${it.unidad}` : ""}` : "Cantidad por definir"}
                  {it.area ? ` · ${it.area}` : ""}
                </p>
              </div>
              {!cubierto
                ? <DonarBoton insumo={it} className="shrink-0 !h-11 !px-4 !text-base" />
                : <span className="shrink-0 text-sm font-medium text-emerald-600">✅ Listo</span>}
            </li>
          );
        })}
        {needs.length === 0 && (
          <li className="text-center text-muted-foreground py-8">
            {sol.insumos.length ? "Ninguna necesidad coincide con tu búsqueda." : "Esta solicitud aún no tiene necesidades."}
          </li>
        )}
      </ul>

      <p className="text-center text-xs text-muted-foreground pt-2">
        Hecho con 💜 en <a href="/" className="underline">AviHelp</a> · No necesitas cuenta para donar.
      </p>
    </div>
  );
}
