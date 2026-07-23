"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { crearVoluntario } from "@/app/actions/voluntarios";
import {
  AREAS_CONOCIMIENTO, DISPONIBILIDAD, DURACION_TURNO, ESTADOS_VENEZUELA,
  FRECUENCIA, GRUPOS_SANGUINEOS, POSTULACION, type VoluntarioPayload,
} from "@/lib/voluntarios";

// LANE V — Formulario PÚBLICO multi-sección (mismas secciones y labels del
// Google Form "PERSONAL DE SALUD VOLUNTARIO"). Mobile-first, sin login.

const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));

// Botonera Sí/No accesible (para binarios no usamos select).
function SiNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[{ v: true, l: "Sí" }, { v: false, l: "No" }].map(({ v, l }) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={
            "h-11 rounded-lg border text-sm font-medium transition-colors md:h-9 " +
            (value === v
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:bg-muted")
          }
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// Botonera de opciones (2-3 valores cortos) — mismo criterio que Sí/No.
function OpcionBotones({ opciones, value, onChange }: {
  opciones: readonly string[]; value: string | null; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {opciones.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={
            "min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors md:min-h-9 " +
            (value === o
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:bg-muted")
          }
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Campo({ label, obligatorio = false, children, ayuda }: {
  label: string; obligatorio?: boolean; children: React.ReactNode; ayuda?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label} {obligatorio && <span className="text-destructive">*</span>}
      </label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function RegistroVoluntario() {
  // ── Datos personales ──
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [edad, setEdad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [estadoVive, setEstadoVive] = useState<string | null>(null);
  const [emergencia, setEmergencia] = useState("");
  // ── Perfil profesional y académico ──
  const [area, setArea] = useState<string | null>(null);
  const [areaOtro, setAreaOtro] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [mpps, setMpps] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // ── Logística y disponibilidad ──
  const [disponibilidad, setDisponibilidad] = useState<string | null>(null);
  const [frecuencia, setFrecuencia] = useState<string | null>(null);
  const [duracion, setDuracion] = useState<string | null>(null);
  const [transporte, setTransporte] = useState<boolean | null>(null);
  const [postulacion, setPostulacion] = useState<string | null>(null);
  // ── Datos de salud ──
  const [sangre, setSangre] = useState<string | null>(null);
  const [alergias, setAlergias] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  const areaOpts = useMemo(() => opts(AREAS_CONOCIMIENTO), []);
  const estadoOpts = useMemo(() => opts(ESTADOS_VENEZUELA), []);
  const sangreOpts = useMemo(() => opts(GRUPOS_SANGUINEOS), []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Validación mínima en cliente (el server action re-valida todo).
    if (!nombre.trim()) return setError("Escribe tu nombre y apellido.");
    if (!cedula.trim()) return setError("Escribe tu cédula de identidad.");
    const edadNum = Number(edad);
    if (!edad || !Number.isFinite(edadNum)) return setError("Indica tu edad.");
    if (!telefono.trim()) return setError("Escribe tu número de teléfono.");
    if (!estadoVive) return setError("Selecciona el estado donde vives actualmente.");
    if (!emergencia.trim()) return setError("Indica tu contacto en caso de emergencia (nombre + parentesco).");
    if (!area) return setError("Selecciona tu área de conocimiento.");
    if (area === "Otro" && !areaOtro.trim()) return setError("Especifica tu área de conocimiento en \"Otro\".");
    if (!disponibilidad) return setError("Selecciona tu disponibilidad de tiempo.");
    if (!frecuencia) return setError("Selecciona la frecuencia de voluntariado.");
    if (!duracion) return setError("Selecciona la duración de turnos.");
    if (transporte == null) return setError("Indica si cuentas con transporte personal.");
    if (!postulacion) return setError("Indica cómo te postulas.");
    if (!sangre) return setError("Selecciona tu grupo sanguíneo.");
    if (!alergias.trim()) return setError("Indica alergias o condiciones médicas importantes (escribe \"Ninguna\" si no aplica).");

    setEnviando(true);
    const payload: VoluntarioPayload = {
      nombre: nombre.trim(),
      cedula: cedula.trim(),
      edad: Math.floor(edadNum),
      telefono: telefono.trim(),
      estado_residencia: estadoVive,
      contacto_emergencia: emergencia.trim(),
      area_conocimiento: area === "Otro" ? `Otro: ${areaOtro.trim()}` : area,
      especialidad: especialidad.trim() || null,
      mpps: mpps.trim() || null,
      disponibilidad,
      frecuencia,
      duracion_turno: duracion,
      transporte_propio: transporte,
      postulacion,
      grupo_sanguineo: sangre,
      alergias: alergias.trim(),
    };
    // La constancia (opcional) viaja aparte como FormData.
    let fd: FormData | null = null;
    const f = fileRef.current?.files?.[0];
    if (f) { fd = new FormData(); fd.append("constancia", f); }

    const r = await crearVoluntario(payload, fd);
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setListo(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (listo) {
    return (
      <Card className="text-center">
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">¡Registro enviado!</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Gracias por postularte como personal de salud voluntario. El equipo de la
            fundación revisará tu registro y te contactará por teléfono para coordinar
            tus turnos en el cronograma médico.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline" }) + " mt-2"}>
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold">🩺 Personal de salud voluntario</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Postúlate como voluntario/a de la Fundación Agua Verde. Los campos con{" "}
          <span className="text-destructive">*</span> son obligatorios.
        </p>
      </div>

      {/* ── 1. Datos personales ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos personales</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Campo label="Nombre y Apellido" obligatorio>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. María Pérez" autoComplete="name" />
          </Campo>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Cédula de identidad" obligatorio>
              <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="V-12.345.678" inputMode="numeric" />
            </Campo>
            <Campo label="Edad" obligatorio>
              <Input value={edad} onChange={(e) => setEdad(e.target.value)} placeholder="Ej. 28" type="number" min={16} max={100} inputMode="numeric" />
            </Campo>
          </div>
          <Campo label="Número de teléfono" obligatorio>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="0412-1234567" type="tel" autoComplete="tel" />
          </Campo>
          <Campo label="Estado donde vive actualmente" obligatorio>
            <SearchableSelect options={estadoOpts} value={estadoVive} onChange={setEstadoVive} placeholder="Busca tu estado…" />
          </Campo>
          <Campo label="Contacto en caso de emergencia (nombre + parentesco)" obligatorio>
            <Input value={emergencia} onChange={(e) => setEmergencia(e.target.value)} placeholder="Ej. José Pérez — padre, 0414-7654321" />
          </Campo>
        </CardContent>
      </Card>

      {/* ── 2. Perfil profesional y académico ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil profesional y académico</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Campo label="Área de conocimiento" obligatorio>
            <SearchableSelect options={areaOpts} value={area} onChange={setArea} placeholder="Selecciona tu área…" />
          </Campo>
          {area === "Otro" && (
            <Campo label="Especifica tu área de conocimiento" obligatorio>
              <Input value={areaOtro} onChange={(e) => setAreaOtro(e.target.value)} placeholder="Ej. Paramédico, fisioterapeuta…" />
            </Campo>
          )}
          {area === "Médico Especialista" && (
            <Campo label="En caso de ser Médico Especialista, indique aquí">
              <Input value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} placeholder="Ej. Traumatología, Pediatría…" />
            </Campo>
          )}
          <Campo label="Número de MPPS / Matrícula profesional">
            <Input value={mpps} onChange={(e) => setMpps(e.target.value)} placeholder="Ej. 123456" />
          </Campo>
          <Campo
            label="Si no cuenta con número MPPS, adjunte constancia o carta"
            ayuda="Opcional. Imagen o PDF, máx. 10 MB."
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />
          </Campo>
        </CardContent>
      </Card>

      {/* ── 3. Logística y disponibilidad ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logística y disponibilidad</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Campo label="Disponibilidad de tiempo" obligatorio>
            <OpcionBotones opciones={DISPONIBILIDAD} value={disponibilidad} onChange={setDisponibilidad} />
          </Campo>
          <Campo label="Frecuencia de voluntariado" obligatorio>
            <OpcionBotones opciones={FRECUENCIA} value={frecuencia} onChange={setFrecuencia} />
          </Campo>
          <Campo label="Duración de turnos" obligatorio>
            <OpcionBotones opciones={DURACION_TURNO} value={duracion} onChange={setDuracion} />
          </Campo>
          <Campo label="¿Cuenta con transporte personal?" obligatorio>
            <SiNo value={transporte} onChange={setTransporte} />
          </Campo>
          <Campo label="¿Cómo te postulas?" obligatorio>
            <OpcionBotones opciones={POSTULACION} value={postulacion} onChange={setPostulacion} />
          </Campo>
        </CardContent>
      </Card>

      {/* ── 4. Datos de salud ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de salud</CardTitle>
          <CardDescription>
            Esta información es solo para tu seguridad durante las jornadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Campo label="Grupo sanguíneo" obligatorio>
            <SearchableSelect options={sangreOpts} value={sangre} onChange={setSangre} placeholder="Selecciona tu grupo…" />
          </Campo>
          <Campo label="Alergia o condiciones médicas importantes" obligatorio ayuda='Si no tienes, escribe "Ninguna".'>
            <Textarea value={alergias} onChange={(e) => setAlergias(e.target.value)} placeholder="Ej. Alergia a la penicilina" rows={3} />
          </Campo>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={enviando} className="w-full">
        {enviando ? "Enviando…" : "Enviar registro"}
      </Button>
      <p className="pb-4 text-center text-xs text-muted-foreground">
        Al enviar, tu postulación queda pendiente de revisión por el equipo de la fundación.
      </p>
    </form>
  );
}
