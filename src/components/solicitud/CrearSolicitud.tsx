"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ClipboardPaste, Link2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Captura } from "@/components/Captura";
import { crearSolicitudDesdeTexto, crearSolicitudDesdeURL, crearSolicitudDesdeInsumos, crearSolicitudDesdeCarga } from "@/app/actions/solicitudes";

type Hosp = { id: string; nombre: string; tipo: string };
type Need = { id: string; nombre: string; cantidad: number | null; estado: string; hospital_id: string; hospital: string | null };
type Carga = { id: string; resumen: string | null; tipo: string | null; created_at: string; n: number };
type Modo = "documento" | "texto" | "url" | "existentes";

const MODOS: { id: Modo; icon: any; titulo: string; desc: string }[] = [
  { id: "documento", icon: FileText, titulo: "Cargar documento", desc: "Foto, PDF, Excel o Word con la lista de insumos" },
  { id: "texto", icon: ClipboardPaste, titulo: "Pegar texto", desc: "Copia y pega una lista de necesidades" },
  { id: "url", icon: Link2, titulo: "Pegar un enlace (URL)", desc: "Importamos las necesidades de una página web" },
  { id: "existentes", icon: Layers, titulo: "Reunir necesidades", desc: "Agrupa necesidades ya cargadas para compartir en cambote" },
];

export function CrearSolicitud({ hospitales, agrupables, cargas }: { hospitales: Hosp[]; agrupables: Need[]; cargas: Carga[] }) {
  const [modo, setModo] = useState<Modo | null>(null);
  const router = useRouter();
  const unicoHospital = hospitales.length === 1 ? hospitales[0].id : null;
  const [hospitalId, setHospitalId] = useState<string | null>(unicoHospital);
  const opcionesHosp = hospitales.map((h) => ({ value: h.id, label: h.nombre, keywords: h.tipo }));
  const necesitaHospital = hospitales.length > 1; // admin/multi-centro: hay que elegir

  return (
    <div className="flex flex-col gap-4">
      {/* Botones de entrada — crystal clear */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MODOS.map((m) => {
          const Icon = m.icon;
          const activo = modo === m.id;
          return (
            <button key={m.id} onClick={() => setModo(activo ? null : m.id)}
              className={`text-left rounded-2xl border p-4 flex items-start gap-3 transition active:scale-[0.99]
                ${activo ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted/50"}`}>
              <span className="grid place-items-center size-11 rounded-xl bg-primary/10 text-primary shrink-0"><Icon className="size-5" /></span>
              <span className="min-w-0">
                <span className="block font-semibold">{m.titulo}</span>
                <span className="block text-sm text-muted-foreground">{m.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Selector de centro (cuando el usuario gestiona varios) */}
      {modo && modo !== "existentes" && necesitaHospital && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">¿Para qué centro de salud?</label>
          <SearchableSelect options={opcionesHosp} value={hospitalId} onChange={setHospitalId} placeholder="Elige el centro…" />
        </div>
      )}

      {/* Panel del modo elegido */}
      {modo === "documento" && (
        <div className="rounded-2xl border p-3 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Sube tu documento (foto, PDF, Excel o Word). Avi lo lee y guarda las necesidades. Al guardarlas aparecen abajo para compartirlas como solicitud con enlace público.
          </p>
          <Captura />
          {cargas.length > 0 && (
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-semibold mb-2">📄 Documentos listos para compartir</p>
              <ul className="flex flex-col gap-2">
                {cargas.map((c) => <CargaFila key={c.id} carga={c} onListo={(slug) => router.push(`/solicitud/${slug}`)} />)}
              </ul>
            </div>
          )}
        </div>
      )}
      {modo === "texto" && <FormTexto hospitalId={hospitalId} necesitaHospital={necesitaHospital} onListo={(slug) => router.push(`/solicitud/${slug}`)} />}
      {modo === "url" && <FormURL hospitalId={hospitalId} necesitaHospital={necesitaHospital} onListo={(slug) => router.push(`/solicitud/${slug}`)} />}
      {modo === "existentes" && <FormExistentes agrupables={agrupables} onListo={(slug) => router.push(`/solicitud/${slug}`)} />}
    </div>
  );
}

function CargaFila({ carga, onListo }: { carga: Carga; onListo: (slug: string) => void }) {
  const [cargando, setCargando] = useState(false);
  async function compartir() {
    setCargando(true);
    const r = await crearSolicitudDesdeCarga(carga.id);
    setCargando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Documento compartido como solicitud.");
    onListo(r.slug);
  }
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0 text-sm">
        <span className="font-medium truncate block">{carga.resumen || carga.tipo || "Documento"}</span>
        <span className="text-xs text-muted-foreground">{carga.n} necesidad(es)</span>
      </span>
      <Button size="sm" variant="outline" onClick={compartir} disabled={cargando} className="shrink-0">{cargando ? "…" : "Compartir"}</Button>
    </li>
  );
}

function FormTexto({ hospitalId, necesitaHospital, onListo }: { hospitalId: string | null; necesitaHospital: boolean; onListo: (slug: string) => void }) {
  const [texto, setTexto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [cargando, setCargando] = useState(false);
  async function enviar() {
    if (necesitaHospital && !hospitalId) { toast.error("Elige el centro de salud."); return; }
    if (!texto.trim()) { toast.error("Pega el texto con las necesidades."); return; }
    setCargando(true);
    const r = await crearSolicitudDesdeTexto({ texto, titulo: titulo || undefined, hospitalId: hospitalId || undefined });
    setCargando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Solicitud creada: ${r.creadas} necesidad(es).`);
    onListo(r.slug);
  }
  return (
    <div className="rounded-2xl border p-3 flex flex-col gap-3">
      <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional, ej. «Insumos urgentes UCI»)" className="h-11 text-base" />
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className="text-base"
        placeholder={"Pega aquí la lista. Ej:\n- 50 cajas de guantes estériles\n- 20 ampollas de adrenalina\n- 10 férulas pediátricas"} />
      <Button size="lg" onClick={enviar} disabled={cargando} className="text-base">{cargando ? "Analizando…" : "Crear solicitud compartible"}</Button>
    </div>
  );
}

function FormURL({ hospitalId, necesitaHospital, onListo }: { hospitalId: string | null; necesitaHospital: boolean; onListo: (slug: string) => void }) {
  const [url, setUrl] = useState("");
  const [cargando, setCargando] = useState(false);
  async function enviar() {
    if (necesitaHospital && !hospitalId) { toast.error("Elige el centro de salud."); return; }
    if (!url.trim()) { toast.error("Pega un enlace válido."); return; }
    setCargando(true);
    const r = await crearSolicitudDesdeURL({ url, hospitalId: hospitalId || undefined });
    setCargando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Importado: ${r.creadas} nueva(s), ${r.actualizadas} actualizada(s).`);
    onListo(r.slug);
  }
  return (
    <div className="rounded-2xl border p-3 flex flex-col gap-3">
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ejemplo.org/necesidades" inputMode="url" className="h-11 text-base" />
      <p className="text-xs text-muted-foreground">Leemos la página y extraemos los insumos. Si ya la importaste antes, actualizamos las cantidades que cambiaron.</p>
      <Button size="lg" onClick={enviar} disabled={cargando} className="text-base">{cargando ? "Leyendo la página…" : "Importar y crear solicitud"}</Button>
    </div>
  );
}

function FormExistentes({ agrupables, onListo }: { agrupables: Need[]; onListo: (slug: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [titulo, setTitulo] = useState("");
  const [cargando, setCargando] = useState(false);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function enviar() {
    if (!sel.size) { toast.error("Selecciona al menos una necesidad."); return; }
    setCargando(true);
    const r = await crearSolicitudDesdeInsumos({ insumoIds: [...sel], titulo: titulo || undefined });
    setCargando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Solicitud creada con ${r.creadas} necesidad(es).`);
    onListo(r.slug);
  }
  if (!agrupables.length) return <div className="rounded-2xl border p-4 text-sm text-muted-foreground">No tienes necesidades sueltas para agrupar. Crea algunas desde un documento o texto primero.</div>;
  return (
    <div className="rounded-2xl border p-3 flex flex-col gap-3">
      <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título del paquete (opcional)" className="h-11 text-base" />
      <p className="text-sm font-medium">{sel.size} seleccionada(s)</p>
      <ul className="flex flex-col gap-1.5 max-h-80 overflow-auto">
        {agrupables.map((n) => (
          <li key={n.id}>
            <button onClick={() => toggle(n.id)}
              className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition ${sel.has(n.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
              <span className={`grid place-items-center size-6 rounded-md border shrink-0 ${sel.has(n.id) ? "bg-primary text-primary-foreground border-primary" : ""}`}>{sel.has(n.id) ? "✓" : ""}</span>
              <span className="min-w-0">
                <span className="block font-medium capitalize truncate">{n.nombre}</span>
                <span className="block text-xs text-muted-foreground">{n.cantidad ?? "—"}{n.hospital ? ` · 🏥 ${n.hospital}` : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button size="lg" onClick={enviar} disabled={cargando} className="text-base">{cargando ? "Creando…" : "Crear solicitud en cambote"}</Button>
    </div>
  );
}
