"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { eliminarTurnoCronograma, listarCronograma } from "@/app/actions/voluntarios";
import type { FilaCronograma } from "@/lib/voluntarios";

// LANE V — CRONOGRAMA MÉDICO semanal, igual al Excel real de la fundación:
// una fila por turno con Días | Nombre | Especialidad | Turno, agrupado Lunes→Domingo.
// Sin librerías: tabla + Tailwind, navegación por semana, imprimible (print:hidden
// en los controles; la grilla queda limpia en papel).

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const TURNO_BADGE: Record<string, string> = {
  AM: "bg-sky-100 text-sky-700",
  PM: "bg-indigo-100 text-indigo-700",
  "12": "bg-amber-100 text-amber-700",
  "24": "bg-emerald-100 text-emerald-700",
  "48": "bg-rose-100 text-rose-700",
};

function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtCorto(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}
function nombreDe(t: FilaCronograma): string {
  return t.voluntario?.nombre ?? t.persona_nombre ?? "Voluntario";
}
function especialidadDe(t: FilaCronograma): string {
  return (
    t.especialidad ??
    t.voluntario?.especialidad ??
    t.voluntario?.area_conocimiento ??
    "—"
  );
}
// Turno del Excel: usa la columna `turno`; si es un turno viejo sin columna, deriva AM/PM de la hora.
function turnoDe(t: FilaCronograma): string {
  if (t.turno) return t.turno;
  const h = new Date(t.inicio).getHours();
  return h < 12 ? "AM" : "PM";
}

export function Cronograma({ turnosInicial, desdeInicial, esLogistica }: {
  turnosInicial: FilaCronograma[];
  desdeInicial: string; // lunes de la semana visible (ISO)
  esLogistica: boolean;
}) {
  const [desde, setDesde] = useState(new Date(desdeInicial));
  const [turnos, setTurnos] = useState<FilaCronograma[]>(turnosInicial);
  const [cargando, setCargando] = useState(false);

  async function cargar(base: Date) {
    setCargando(true);
    const hasta = new Date(base);
    hasta.setDate(hasta.getDate() + 7);
    const rows = await listarCronograma(base.toISOString(), hasta.toISOString());
    setTurnos(rows);
    setCargando(false);
  }

  function moverSemana(delta: number) {
    const d = new Date(desde);
    d.setDate(d.getDate() + delta * 7);
    setDesde(d);
    void cargar(d);
  }

  async function quitar(t: FilaCronograma) {
    if (!window.confirm(`¿Quitar del cronograma el turno de ${nombreDe(t)}?`)) return;
    const r = await eliminarTurnoCronograma(t.id);
    if (!r.ok) return toast.error(r.error);
    toast.success("Turno quitado del cronograma.");
    void cargar(desde);
  }

  // 7 días Lunes→Domingo con sus turnos (cancelados fuera).
  const dias = useMemo(() => {
    const activos = turnos.filter((t) => t.estado !== "cancelado");
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(desde);
      fecha.setDate(fecha.getDate() + i);
      const clave = claveDia(fecha);
      const delDia = activos
        .filter((t) => claveDia(new Date(t.inicio)) === clave)
        .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));
      return { nombre: DIAS[i], fecha, delDia };
    });
  }, [turnos, desde]);

  const finSemana = useMemo(() => {
    const d = new Date(desde);
    d.setDate(d.getDate() + 6);
    return d;
  }, [desde]);

  const total = dias.reduce((n, d) => n + d.delDia.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">🗓️ Cronograma Médico</h1>
        <p className="text-sm text-muted-foreground">
          Semana del {fmtCorto(desde)} al {fmtCorto(finSemana)} · {total} turno{total === 1 ? "" : "s"}
        </p>
      </div>

      {/* Controles (no salen en la impresión) */}
      <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => moverSemana(-1)} disabled={cargando}>
          ← Semana anterior
        </Button>
        <Button variant="outline" size="sm" onClick={() => moverSemana(1)} disabled={cargando}>
          Semana siguiente →
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          🖨️ Imprimir
        </Button>
        {esLogistica && (
          <Link href="/voluntarios" className={buttonVariants({ size: "sm" })}>
            + Agendar desde el roster
          </Link>
        )}
      </div>

      {/* Grilla del Excel: Días | Nombre | Especialidad | Turno */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-semibold">Días</th>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Especialidad</th>
              <th className="px-3 py-2 font-semibold">Turno</th>
              {esLogistica && <th className="px-3 py-2 print:hidden" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {dias.map((dia) => {
              const filas = dia.delDia;
              if (filas.length === 0) {
                return (
                  <tr key={dia.nombre} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 align-top font-medium">
                      {dia.nombre}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{fmtCorto(dia.fecha)}</span>
                    </td>
                    <td colSpan={esLogistica ? 4 : 3} className="px-3 py-2 text-muted-foreground">
                      — Sin personal agendado —
                    </td>
                  </tr>
                );
              }
              return filas.map((t, i) => (
                <tr key={t.id} className={i === filas.length - 1 ? "border-b last:border-0" : ""}>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-medium">
                    {i === 0 && (
                      <>
                        {dia.nombre}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">{fmtCorto(dia.fecha)}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {nombreDe(t)}
                    {t.centro?.nombre && (
                      <span className="block text-xs text-muted-foreground">{t.centro.nombre}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{especialidadDe(t)}</td>
                  <td className="px-3 py-2">
                    <Badge className={TURNO_BADGE[turnoDe(t)] ?? "bg-muted text-muted-foreground"}>
                      {turnoDe(t)}
                    </Badge>
                  </td>
                  {esLogistica && (
                    <td className="px-3 py-2 text-right print:hidden">
                      <button
                        type="button"
                        onClick={() => void quitar(t)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                        aria-label={`Quitar turno de ${nombreDe(t)}`}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-muted-foreground print:hidden">
        Turnos: AM (07:00–13:00) · PM (13:00–19:00) · 12 / 24 / 48 horas desde las 07:00.
      </p>
    </div>
  );
}
