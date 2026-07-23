"use client";

import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  listarAgenda, crearTurno, actualizarTurno, eliminarTurno, type TurnoAgenda,
} from "@/app/actions/agenda";

// LANE T — CALENDARIO/AGENDA reusable (sin librerías de calendario: CSS + fechas).
// Lista agrupada por día, navegación por semana. Dos pestañas sobre la MISMA tabla:
//   Voluntarios → turnos de presencia en centros de apoyo (nombre o usuario + horario)
//   Camioneros  → disponibilidad de choferes para el despacho
// Un camionero (sin scope logístico) solo ve/gestiona su propia disponibilidad.

type Centro = { id: string; nombre: string; zona?: string | null };
type Camionero = { id: string; nombre: string; activo: boolean };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const ESTADO_TURNO: Record<string, { label: string; cls: string }> = {
  disponible: { label: "Disponible", cls: "bg-sky-100 text-sky-700" },
  ocupado:    { label: "Ocupado", cls: "bg-amber-100 text-amber-700" },
  confirmado: { label: "Confirmado", cls: "bg-emerald-100 text-emerald-700" },
  cancelado:  { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function nombreTurno(t: TurnoAgenda): string {
  if (t.tipo === "camionero") return t.camionero?.nombre ?? "Camionero";
  return t.persona_nombre ?? "Voluntario";
}

export function Calendario({ esLogistica, miCamioneroId, turnosInicial, camioneros, centros, desdeInicial }: {
  esLogistica: boolean; miCamioneroId: string | null;
  turnosInicial: TurnoAgenda[]; camioneros: Camionero[]; centros: Centro[];
  desdeInicial: string;
}) {
  const [desde, setDesde] = useState(new Date(desdeInicial)); // lunes de la semana visible
  // "Hoy" solo en cliente (evita hydration mismatch por new Date() en render).
  const [hoyKey, setHoyKey] = useState("");
  useEffect(() => { setHoyKey(claveDia(new Date())); }, []);
  const [turnos, setTurnos] = useState<TurnoAgenda[]>(turnosInicial);
  const [tab, setTab] = useState<string>(esLogistica ? "voluntario" : "camionero");
  const [centroFiltro, setCentroFiltro] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const centroOpts = useMemo(() => centros.map((c) => ({ value: c.id, label: c.nombre, keywords: c.zona ?? "" })), [centros]);
  const camioneroOpts = useMemo(() => camioneros.filter((c) => c.activo).map((c) => ({ value: c.id, label: c.nombre })), [camioneros]);

  async function cargar(base: Date) {
    setCargando(true);
    const hasta = new Date(base); hasta.setDate(hasta.getDate() + 7);
    const rows = await listarAgenda({ desde: base.toISOString(), hasta: hasta.toISOString() });
    setTurnos(rows); setCargando(false);
  }

  function moverSemana(delta: number) {
    const d = new Date(desde); d.setDate(d.getDate() + delta * 7);
    setDesde(d); void cargar(d);
  }

  // 7 días de la semana visible, con los turnos del tab actual agrupados por día.
  const dias = useMemo(() => {
    const visibles = turnos.filter((t) =>
      t.tipo === tab && (!centroFiltro || t.centro_id === centroFiltro),
    );
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(desde); d.setDate(d.getDate() + i);
      const clave = claveDia(d);
      const delDia = visibles
        .filter((t) => claveDia(new Date(t.inicio)) === clave)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
      const presentes = delDia.filter((t) => t.estado !== "cancelado").length;
      return { fecha: d, delDia, presentes };
    });
  }, [turnos, tab, centroFiltro, desde]);

  const finSemana = useMemo(() => { const d = new Date(desde); d.setDate(d.getDate() + 6); return d; }, [desde]);

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            {esLogistica && <TabsTrigger value="voluntario">🙋 Voluntarios</TabsTrigger>}
            <TabsTrigger value="camionero">🚚 Camioneros</TabsTrigger>
          </TabsList>
          {esLogistica && (
            <SearchableSelect options={centroOpts} value={centroFiltro} onChange={setCentroFiltro}
              placeholder="Todos los centros" className="sm:max-w-64" />
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          <Button size="sm" variant="outline" onClick={() => moverSemana(-1)}>← Semana</Button>
          <p className="text-sm font-medium">
            {desde.getDate()} {MESES[desde.getMonth()]} – {finSemana.getDate()} {MESES[finSemana.getMonth()]} {finSemana.getFullYear()}
            {cargando && <span className="text-muted-foreground"> · cargando…</span>}
          </p>
          <Button size="sm" variant="outline" onClick={() => moverSemana(1)}>Semana →</Button>
        </div>

        <TabsContent value="voluntario" className="mt-3">
          {esLogistica && (
            <FormTurno tipo="voluntario" centroOpts={centroOpts} camioneroOpts={camioneroOpts}
              miCamioneroId={miCamioneroId} onCreado={() => cargar(desde)} />
          )}
        </TabsContent>
        <TabsContent value="camionero" className="mt-3">
          <FormTurno tipo="camionero" centroOpts={centroOpts} camioneroOpts={camioneroOpts}
            miCamioneroId={miCamioneroId} soloPropio={!esLogistica} onCreado={() => cargar(desde)} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-col gap-3">
        {dias.map(({ fecha, delDia, presentes }) => {
          const esHoy = claveDia(fecha) === hoyKey;
          return (
            <div key={claveDia(fecha)} className={`rounded-xl border p-3 ${esHoy ? "border-primary/60 bg-primary/5" : "bg-card"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold capitalize">
                  {DIAS[fecha.getDay()]} {fecha.getDate()} {MESES[fecha.getMonth()]}
                  {esHoy && <span className="ml-2 text-xs text-primary font-normal">hoy</span>}
                </p>
                <span className="text-xs text-muted-foreground">
                  {presentes ? `${presentes} ${tab === "voluntario" ? "presente(s)" : "disponible(s)"}` : "—"}
                </span>
              </div>
              {!delDia.length && (
                <p className="text-xs text-muted-foreground">Sin turnos.</p>
              )}
              <div className="flex flex-col gap-1.5">
                {delDia.map((t) => (
                  <FilaTurno key={t.id} turno={t}
                    editable={esLogistica || (t.tipo === "camionero" && t.camionero_id === miCamioneroId)}
                    onCambio={() => cargar(desde)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Fila de turno: nombre + horario + estado + acciones rápidas ──
function FilaTurno({ turno, editable, onCambio }: { turno: TurnoAgenda; editable: boolean; onCambio: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const est = ESTADO_TURNO[turno.estado] ?? ESTADO_TURNO.disponible;

  async function setEstado(estado: string) {
    setOcupado(true);
    const r = await actualizarTurno(turno.id, { estado });
    setOcupado(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Turno actualizado."); onCambio();
  }
  async function borrar() {
    if (!confirm("¿Eliminar este turno?")) return;
    setOcupado(true);
    const r = await eliminarTurno(turno.id);
    setOcupado(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Turno eliminado."); onCambio();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
      <span className="font-medium truncate">{turno.tipo === "camionero" ? "🚚" : "🙋"} {nombreTurno(turno)}</span>
      <span className="text-xs text-muted-foreground">
        {hora(turno.inicio)}{turno.fin ? `–${hora(turno.fin)}` : ""}
        {turno.centro?.nombre && <> · {turno.centro.nombre}</>}
        {turno.hospital?.nombre && <> · {turno.hospital.nombre}</>}
      </span>
      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${est.cls}`}>{est.label}</span>
      {editable && (
        <span className="flex items-center gap-1">
          {turno.estado !== "confirmado" && turno.estado !== "cancelado" && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={ocupado} onClick={() => setEstado("confirmado")}>✓ Confirmar</Button>
          )}
          {turno.estado !== "cancelado" && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-muted-foreground" disabled={ocupado} onClick={() => setEstado("cancelado")}>Cancelar</Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-destructive" disabled={ocupado} onClick={borrar}>🗑</Button>
        </span>
      )}
      {turno.nota && <p className="w-full text-xs text-muted-foreground">{turno.nota}</p>}
    </div>
  );
}

// ── Alta de turno (voluntario o disponibilidad de camionero) ──
function FormTurno({ tipo, centroOpts, camioneroOpts, miCamioneroId, soloPropio = false, onCreado }: {
  tipo: "voluntario" | "camionero";
  centroOpts: { value: string; label: string }[];
  camioneroOpts: { value: string; label: string }[];
  miCamioneroId: string | null;
  soloPropio?: boolean;
  onCreado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [camioneroId, setCamioneroId] = useState<string | null>(soloPropio ? miCamioneroId : null);
  const [centroId, setCentroId] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFin, setHoraFin] = useState("");
  const [estado, setEstado] = useState<string>(tipo === "camionero" ? "disponible" : "confirmado");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!fecha) { toast.error("Indica la fecha."); return; }
    if (tipo === "voluntario" && !nombre.trim()) { toast.error("Indica el nombre del voluntario."); return; }
    if (tipo === "camionero" && !soloPropio && !camioneroId) { toast.error("Selecciona el camionero."); return; }
    const inicio = new Date(`${fecha}T${horaInicio || "00:00"}`);
    const fin = horaFin ? new Date(`${fecha}T${horaFin}`) : null;
    if (fin && fin <= inicio) { toast.error("La hora fin debe ser mayor a la de inicio."); return; }
    setGuardando(true);
    const r = await crearTurno({
      tipo,
      camioneroId: tipo === "camionero" ? (soloPropio ? miCamioneroId : camioneroId) : null,
      personaNombre: tipo === "voluntario" ? nombre.trim() : null,
      centroId,
      inicio: inicio.toISOString(),
      fin: fin ? fin.toISOString() : null,
      estado,
      nota: nota.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Turno agregado al calendario.");
    setNombre(""); setNota(""); setHoraFin(""); setAbierto(false);
    onCreado();
  }

  if (!abierto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        ＋ {tipo === "voluntario" ? "Agregar turno de voluntario" : soloPropio ? "Agregar mi disponibilidad" : "Agregar disponibilidad de camionero"}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border p-4 bg-card flex flex-col gap-3">
      <p className="font-medium text-sm">
        {tipo === "voluntario" ? "Nuevo turno de voluntario" : "Nueva disponibilidad de camionero"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {tipo === "voluntario" ? (
          <Input placeholder="Nombre del voluntario *" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        ) : soloPropio ? (
          <p className="text-sm text-muted-foreground self-center">Tu disponibilidad</p>
        ) : (
          <SearchableSelect options={camioneroOpts} value={camioneroId} onChange={setCamioneroId} placeholder="Camionero *" />
        )}
        <SearchableSelect options={centroOpts} value={centroId} onChange={setCentroId} placeholder="Centro (opcional)" />
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha" />
        <div className="flex items-center gap-2">
          <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} aria-label="Hora inicio" />
          <span className="text-muted-foreground text-sm">a</span>
          <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} aria-label="Hora fin" />
        </div>
        <SearchableSelect
          options={[
            { value: "disponible", label: "Disponible" },
            { value: "ocupado", label: "Ocupado" },
            { value: "confirmado", label: "Confirmado" },
          ]}
          value={estado} onChange={(v) => setEstado(v ?? "disponible")} placeholder="Estado"
        />
        <Input placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar turno"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

export default Calendario;
