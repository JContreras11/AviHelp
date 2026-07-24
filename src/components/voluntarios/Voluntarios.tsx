"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { urlFoto } from "@/lib/media";
import {
  agendarTurnoVoluntario, cambiarEstadoVoluntario, eliminarVoluntario,
  listarComunidadVoluntarios, listarVoluntarios,
} from "@/app/actions/voluntarios";
import {
  AREAS_INTERES, DIAS_SEMANA, TURNOS_CRONOGRAMA,
  type EstadoVoluntario, type TurnoCronograma, type Voluntario,
} from "@/lib/voluntarios";

// LANE V — Gestión de VOLUNTARIOS. Tres vistas:
//   • "Voluntarios postulados" (pool = pendientes) — SOLO admin.
//   • "Activos" (aprobados en servicio) — admin agenda turnos del cronograma.
//   • "Comunidad de voluntarios" (aprobados) — visible para toda la logística (incl. ONG).

type Centro = { id: string; nombre: string; zona?: string | null };

const ESTADO_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  activo: { label: "Activo", cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  inactivo: { label: "Inactivo", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Área e disponibilidad "efectivas": nuevos campos si existen, si no los legados.
const areaDe = (v: Voluntario): string | null =>
  (v.area_interes && v.area_interes.length ? v.area_interes.join(", ") : v.area_conocimiento) ?? null;
const dispDe = (v: Voluntario): string | null =>
  (v.dias_disponibles && v.dias_disponibles.length ? v.dias_disponibles.join(", ") : v.disponibilidad) ?? null;

function DetalleFila({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === "") return null;
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-0 sm:flex-row sm:justify-between sm:gap-3">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{k}</span>
      <span className="text-sm sm:text-right">{v}</span>
    </div>
  );
}

export function Voluntarios({ voluntariosInicial, centros, esAdmin }: {
  voluntariosInicial: Voluntario[];
  centros: Centro[];
  esAdmin: boolean;
}) {
  const [voluntarios, setVoluntarios] = useState<Voluntario[]>(voluntariosInicial);
  const [tab, setTab] = useState(esAdmin ? "postulados" : "comunidad");
  const [q, setQ] = useState("");
  const [fArea, setFArea] = useState<string | null>(null);
  const [fDia, setFDia] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Voluntario | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // "Agendar turno" (crea la fila del cronograma en `agenda`).
  const [agendar, setAgendar] = useState<Voluntario | null>(null);
  const [fecha, setFecha] = useState("");
  const [turno, setTurno] = useState<string | null>(null);
  const [centroId, setCentroId] = useState<string | null>(null);
  const [nota, setNota] = useState("");

  const areaOpts = useMemo(() => {
    const extra = voluntarios.flatMap((v) => [...(v.area_interes ?? []), v.area_conocimiento].filter(Boolean)) as string[];
    const todas = [...new Set([...AREAS_INTERES, ...extra])];
    return todas.map((a) => ({ value: a, label: a }));
  }, [voluntarios]);
  const diaOpts = useMemo(() => DIAS_SEMANA.map((d) => ({ value: d, label: d })), []);
  const centroOpts = useMemo(
    () => centros.map((c) => ({ value: c.id, label: c.nombre, keywords: c.zona ?? "" })),
    [centros],
  );
  const turnoOpts = useMemo(
    () => TURNOS_CRONOGRAMA.map((t) => ({ value: t, label: t === "AM" || t === "PM" ? `Turno ${t}` : `${t} horas` })),
    [],
  );

  // Filtro común (búsqueda + área + día) aplicado a la lista de la pestaña activa.
  const filtrar = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    return (list: Voluntario[]) => list.filter((v) => {
      if (fArea && !((v.area_interes ?? []).includes(fArea) || v.area_conocimiento === fArea)) return false;
      if (fDia && !(v.dias_disponibles ?? []).includes(fDia)) return false;
      if (tokens.length) {
        const hay = norm(`${v.nombre} ${v.cedula ?? ""} ${v.email ?? ""} ${areaDe(v) ?? ""} ${v.organizacion_nombre ?? ""}`);
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [q, fArea, fDia]);

  const postulados = useMemo(() => filtrar(voluntarios.filter((v) => v.estado === "pendiente")), [voluntarios, filtrar]);
  const activos = useMemo(() => filtrar(voluntarios.filter((v) => v.estado === "activo")), [voluntarios, filtrar]);
  const comunidad = useMemo(() => filtrar(voluntarios.filter((v) => v.estado !== "pendiente")), [voluntarios, filtrar]);
  const pendientesTotal = voluntarios.filter((v) => v.estado === "pendiente").length;

  async function recargar() {
    setVoluntarios(esAdmin ? await listarVoluntarios() : await listarComunidadVoluntarios());
  }

  async function setEstado(v: Voluntario, estado: EstadoVoluntario) {
    setOcupado(true);
    const r = await cambiarEstadoVoluntario(v.id, estado);
    setOcupado(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${v.nombre}: ${ESTADO_BADGE[estado].label.toLowerCase()}.`);
    setDetalle(null);
    await recargar();
  }

  async function borrar(v: Voluntario) {
    if (!window.confirm(`¿Eliminar el registro de ${v.nombre}? Esta acción no se puede deshacer.`)) return;
    setOcupado(true);
    const r = await eliminarVoluntario(v.id);
    setOcupado(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Registro eliminado.");
    setDetalle(null);
    await recargar();
  }

  function abrirAgendar(v: Voluntario) {
    setFecha(""); setTurno(null); setCentroId(null); setNota("");
    setAgendar(v);
  }

  async function confirmarAgendar() {
    if (!agendar) return;
    if (!fecha) return toast.error("Indica el día del turno.");
    if (!turno) return toast.error("Selecciona el turno (AM, PM, 12, 24 o 48).");
    setOcupado(true);
    const r = await agendarTurnoVoluntario({
      voluntarioId: agendar.id,
      fecha,
      turno: turno as TurnoCronograma,
      centroId,
      nota: nota || null,
    });
    setOcupado(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Turno ${turno} agendado para ${agendar.nombre}.`);
    setAgendar(null);
  }

  // Card reutilizable. `variante`: "gestion" (con acciones admin) o "comunidad" (info + detalle).
  function renderCard(v: Voluntario, variante: "gestion" | "comunidad") {
    const eb = ESTADO_BADGE[v.estado] ?? ESTADO_BADGE.pendiente;
    return (
      <Card key={v.id}>
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-semibold">
                <span className={`inline-block size-2 shrink-0 rounded-full ${eb.dot}`} aria-hidden />
                <span className="truncate">{v.nombre}</span>
              </p>
              <p className="truncate text-sm text-muted-foreground">{areaDe(v) ?? "Sin área"}</p>
            </div>
            <Badge className={eb.cls}>{eb.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {[v.telefono, v.email, v.organizacion_nombre].filter(Boolean).join(" · ") || "Sin contacto"}
          </p>
          {dispDe(v) && (
            <p className="text-xs text-muted-foreground">📅 {dispDe(v)}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDetalle(v)}>
              Ver detalle
            </Button>
            {variante === "gestion" && v.estado === "pendiente" && (
              <Button size="sm" disabled={ocupado} onClick={() => void setEstado(v, "activo")}>
                ✅ Aprobar
              </Button>
            )}
            {variante === "gestion" && v.estado === "activo" && (
              <Button size="sm" disabled={ocupado} onClick={() => abrirAgendar(v)}>
                📅 Agendar turno
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderGrid(list: Voluntario[], variante: "gestion" | "comunidad", vacio: React.ReactNode) {
    if (list.length === 0) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{vacio}</CardContent>
        </Card>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map((v) => renderCard(v, variante))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros (searchable-select para TODOS los selects) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, cédula, correo u organización…"
          className="sm:max-w-xs"
        />
        <SearchableSelect options={areaOpts} value={fArea} onChange={setFArea} placeholder="Todas las áreas" className="sm:max-w-56" />
        <SearchableSelect options={diaOpts} value={fDia} onChange={setFDia} placeholder="Cualquier día" className="sm:max-w-44" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{voluntarios.length} voluntarios</span>
        {esAdmin && pendientesTotal > 0 && (
          <Badge className="bg-amber-100 text-amber-700">{pendientesTotal} por aprobar</Badge>
        )}
        <Link href="/voluntarios/registro" className="ml-auto text-primary underline-offset-2 hover:underline">
          Formulario público de registro →
        </Link>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {esAdmin && <TabsTrigger value="postulados">Voluntarios postulados</TabsTrigger>}
          {esAdmin && <TabsTrigger value="activos">Activos</TabsTrigger>}
          <TabsTrigger value="comunidad">Comunidad de voluntarios</TabsTrigger>
        </TabsList>

        {esAdmin && (
          <TabsContent value="postulados" className="mt-3">
            {renderGrid(postulados, "gestion",
              <>No hay postulaciones pendientes. Comparte el{" "}
                <Link href="/voluntarios/registro" className="text-primary underline-offset-2 hover:underline">formulario de registro</Link>{" "}para recibir voluntarios.</>)}
          </TabsContent>
        )}

        {esAdmin && (
          <TabsContent value="activos" className="mt-3">
            {renderGrid(activos, "gestion",
              "No hay voluntarios activos con esos filtros. Aprueba postulaciones para activarlos.")}
          </TabsContent>
        )}

        <TabsContent value="comunidad" className="mt-3">
          {renderGrid(comunidad, "comunidad",
            "Aún no hay voluntarios aprobados en la comunidad.")}
        </TabsContent>
      </Tabs>

      {/* Detalle completo */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        {detalle && (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{detalle.nombre}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col">
              <DetalleFila k="Estado" v={<Badge className={(ESTADO_BADGE[detalle.estado] ?? ESTADO_BADGE.pendiente).cls}>{(ESTADO_BADGE[detalle.estado] ?? ESTADO_BADGE.pendiente).label}</Badge>} />
              <DetalleFila k="Cédula de identidad" v={detalle.cedula} />
              <DetalleFila k="Edad" v={detalle.edad != null ? `${detalle.edad} años` : null} />
              <DetalleFila k="Teléfono" v={detalle.telefono} />
              <DetalleFila k="Correo electrónico" v={detalle.email} />
              <DetalleFila k="Estado donde vive" v={detalle.estado_residencia} />
              <DetalleFila k="Contacto de emergencia" v={detalle.contacto_emergencia} />
              <DetalleFila k="Organización" v={detalle.organizacion_nombre} />
              <DetalleFila k="Área(s) de interés" v={areaDe(detalle)} />
              <DetalleFila k="Otra habilidad / herramienta" v={detalle.otra_habilidad} />
              <DetalleFila k="Especialidad" v={detalle.especialidad} />
              <DetalleFila k="MPPS / Matrícula" v={detalle.mpps} />
              <DetalleFila
                k="Constancia"
                v={detalle.constancia_path ? (
                  <a href={urlFoto(detalle.constancia_path) ?? "#"} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                    Ver archivo adjunto
                  </a>
                ) : null}
              />
              <DetalleFila k="Días disponibles" v={dispDe(detalle)} />
              <DetalleFila k="Frecuencia de voluntariado" v={detalle.frecuencia} />
              <DetalleFila k="Duración de turnos" v={detalle.duracion_turno} />
              <DetalleFila k="Transporte personal" v={detalle.transporte_propio == null ? null : detalle.transporte_propio ? "Sí" : "No"} />
              <DetalleFila k="Grupo sanguíneo" v={detalle.grupo_sanguineo} />
              <DetalleFila k="Alergias / condiciones" v={detalle.alergias} />
              <DetalleFila k="Registrado" v={new Date(detalle.created_at).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" })} />
            </div>
            {esAdmin && (
              <div className="mt-3 flex flex-wrap gap-2">
                {detalle.estado === "pendiente" && (
                  <Button size="sm" disabled={ocupado} onClick={() => void setEstado(detalle, "activo")}>✅ Aprobar</Button>
                )}
                {detalle.estado === "activo" && (
                  <>
                    <Button size="sm" disabled={ocupado} onClick={() => { setDetalle(null); abrirAgendar(detalle); }}>📅 Agendar turno</Button>
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void setEstado(detalle, "inactivo")}>Pausar</Button>
                  </>
                )}
                {detalle.estado === "inactivo" && (
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void setEstado(detalle, "activo")}>Reactivar</Button>
                )}
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void borrar(detalle)} className="text-destructive hover:text-destructive">
                  Eliminar
                </Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      {/* Agendar turno del cronograma */}
      <Dialog open={!!agendar} onOpenChange={(o) => !o && setAgendar(null)}>
        {agendar && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Agendar turno — {agendar.nombre}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {areaDe(agendar) || "Sin área"}
                {agendar.duracion_turno ? ` · prefiere turnos de ${agendar.duracion_turno}` : ""}
                {dispDe(agendar) ? ` · ${dispDe(agendar)}` : ""}
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Día</label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Turno</label>
                <SearchableSelect options={turnoOpts} value={turno} onChange={setTurno} placeholder="AM, PM, 12, 24 o 48…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Centro / sede (opcional)</label>
                <SearchableSelect options={centroOpts} value={centroId} onChange={setCentroId} placeholder="Selecciona el centro…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Nota (opcional)</label>
                <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. cubre emergencias" />
              </div>
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAgendar(null)}>Cancelar</Button>
                <Button disabled={ocupado} onClick={() => void confirmarAgendar()}>
                  {ocupado ? "Agendando…" : "Agendar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                El turno queda en el <Link href="/cronograma" className="text-primary underline-offset-2 hover:underline">cronograma médico</Link> y en el calendario.
              </p>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
