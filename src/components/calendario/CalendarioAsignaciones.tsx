"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { EventDropArg, EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  listarAsignaciones, crearAsignacion, moverAsignacion, confirmarAsignacion,
  eliminarAsignacion, type Asignacion,
} from "@/app/actions/calendario";

// LANE CAL — Calendario general de ASIGNACIONES (FullCalendar, MIT/gratis).
// Color: AMARILLO = disponible/tentativo · VERDE = asignado. Muestra el NOMBRE del
// voluntario en cada día. Drag-and-drop para reprogramar (estilo Google Calendar).
// Al confirmar, se sincroniza Google Calendar (stub + .ics de respaldo) desde el server.

type VoluntarioOpt = { id: string; nombre: string };

// Paleta por estado (mobile-first, legible en claro/oscuro).
const COLOR: Record<string, { bg: string; text: string }> = {
  disponible: { bg: "#f59e0b", text: "#422006" }, // ámbar
  tentativo:  { bg: "#f59e0b", text: "#422006" }, // ámbar
  asignado:   { bg: "#16a34a", text: "#ffffff" }, // verde
  cancelado:  { bg: "#9ca3af", text: "#ffffff" }, // gris
};

function descargarICS(ics: string, nombre: string) {
  try {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // no-op
  }
}

export function CalendarioAsignaciones({ asignacionesInicial, voluntarios }: {
  asignacionesInicial: Asignacion[]; voluntarios: VoluntarioOpt[];
}) {
  const calRef = useRef<FullCalendar | null>(null);
  // FullCalendar se monta solo en cliente (evita cualquier mismatch de hidratación).
  const [montado, setMontado] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- montar FullCalendar solo en cliente (SSR-safe, sin mismatch de hidratación)
  useEffect(() => { setMontado(true); }, []);

  const [asignaciones, setAsignaciones] = useState<Asignacion[]>(asignacionesInicial);
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [seleccion, setSeleccion] = useState<Asignacion | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState<string>("");
  const [voluntarioId, setVoluntarioId] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const voluntarioOpts = useMemo(() => voluntarios.map((v) => ({ value: v.id, label: v.nombre })), [voluntarios]);

  const eventos = useMemo(() => asignaciones.map((a) => {
    const c = COLOR[a.estado] ?? COLOR.tentativo;
    return {
      id: a.id,
      title: a.voluntario?.nombre ?? "Voluntario",
      start: a.fecha,
      allDay: true,
      backgroundColor: c.bg, borderColor: c.bg, textColor: c.text,
      extendedProps: { estado: a.estado },
    };
  }), [asignaciones]);

  async function recargar(desde?: string, hasta?: string) {
    const d = desde ?? rango?.desde; const h = hasta ?? rango?.hasta;
    const rows = await listarAsignaciones({ desde: d, hasta: h });
    setAsignaciones(rows);
  }

  // Al navegar de mes, recarga el rango visible.
  function onDatesSet(arg: { startStr: string; endStr: string }) {
    const desde = arg.startStr.slice(0, 10); const hasta = arg.endStr.slice(0, 10);
    setRango({ desde, hasta });
    void recargar(desde, hasta);
  }

  // Drag-and-drop → mueve la asignación a la nueva fecha (revierte si falla).
  async function onEventDrop(arg: EventDropArg) {
    const nueva = arg.event.startStr.slice(0, 10);
    const r = await moverAsignacion(arg.event.id, nueva);
    if (!r.ok) { toast.error(r.error); arg.revert(); return; }
    toast.success("Asignación movida.");
    void recargar();
  }

  function onDateSelect(arg: DateSelectArg) {
    setSeleccion(null);
    setNuevaFecha(arg.startStr.slice(0, 10));
    setVoluntarioId(null); setNotas("");
    calRef.current?.getApi().unselect();
  }

  function onEventClick(arg: EventClickArg) {
    const a = asignaciones.find((x) => x.id === arg.event.id) ?? null;
    setSeleccion(a); setNuevaFecha("");
  }

  async function crear() {
    if (!voluntarioId) { toast.error("Selecciona el voluntario."); return; }
    if (!nuevaFecha) { toast.error("Selecciona la fecha."); return; }
    setGuardando(true);
    const r = await crearAsignacion({ voluntarioId, fecha: nuevaFecha, estado: "tentativo", notas: notas.trim() || null });
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Asignación agregada.");
    setNuevaFecha(""); setVoluntarioId(null); setNotas("");
    void recargar();
  }

  async function confirmar() {
    if (!seleccion) return;
    setGuardando(true);
    const r = await confirmarAsignacion(seleccion.id);
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    if (r.sincronizado) toast.success("Confirmada y sincronizada con Google Calendar.");
    else {
      toast.success("Confirmada. Google Calendar sin OAuth: descargando invitación .ics.");
      if (r.ics) descargarICS(r.ics, r.icsNombre ?? "asignacion.ics");
    }
    setSeleccion(null); void recargar();
  }

  async function borrar() {
    if (!seleccion) return;
    if (!confirm("¿Eliminar esta asignación?")) return;
    setGuardando(true);
    const r = await eliminarAsignacion(seleccion.id);
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Asignación eliminada.");
    setSeleccion(null); void recargar();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Leyenda de colores */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ background: COLOR.tentativo.bg }} /> Disponible / tentativo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ background: COLOR.asignado.bg }} /> Asignado
        </span>
        <span className="text-muted-foreground">· Arrastra un evento para reprogramarlo · Toca un día para asignar</span>
      </div>

      {/* Alta rápida al seleccionar un día (o con el botón) */}
      {(nuevaFecha || !seleccion) && (
        <div className="rounded-xl border bg-card p-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="text-xs text-muted-foreground">Voluntario</label>
            <SearchableSelect options={voluntarioOpts} value={voluntarioId} onChange={setVoluntarioId} placeholder="Voluntario *" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fecha</label>
            <Input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} aria-label="Fecha" />
          </div>
          <div className="flex-1 min-w-40">
            <label className="text-xs text-muted-foreground">Nota (opcional)</label>
            <Input placeholder="Nota" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <Button size="sm" onClick={crear} disabled={guardando}>{guardando ? "Guardando…" : "＋ Asignar"}</Button>
        </div>
      )}

      {/* Panel de acciones para el evento seleccionado */}
      {seleccion && (
        <div className="rounded-xl border bg-card p-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{seleccion.voluntario?.nombre ?? "Voluntario"}</span>
          <span className="text-xs text-muted-foreground">{seleccion.fecha} · {seleccion.estado}</span>
          {seleccion.notas && <span className="w-full text-xs text-muted-foreground">{seleccion.notas}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            {seleccion.estado !== "asignado" && (
              <Button size="sm" onClick={confirmar} disabled={guardando}>✓ Confirmar</Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={borrar} disabled={guardando}>🗑 Eliminar</Button>
            <Button size="sm" variant="ghost" onClick={() => setSeleccion(null)}>Cerrar</Button>
          </span>
        </div>
      )}

      {/* Calendario (FullCalendar) — mobile-first */}
      <div className="rounded-xl border bg-card p-2 sm:p-3 fc-avihelp">
        {montado && (
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={esLocale}
            firstDay={1}
            headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
            buttonText={{ today: "Hoy" }}
            height="auto"
            editable
            selectable
            dayMaxEvents={3}
            events={eventos}
            datesSet={onDatesSet}
            eventDrop={onEventDrop}
            select={onDateSelect}
            eventClick={onEventClick}
          />
        )}
      </div>
    </div>
  );
}

export default CalendarioAsignaciones;
