"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChatPanel } from "@/components/ChatPanel";
import { useChat } from "@/lib/chat-store";
import { Logo } from "@/components/Brand";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { donarNecesidad } from "@/app/actions/donaciones";

type Insumo = { id: string; nombre: string; cantidad: number | null; unidad: string | null; prioridad: string; hospitales: { nombre: string } | null };

const CHIPS = [
  { txt: "🩹 ¿Qué insumos faltan?", msg: "¿Qué insumos faltan en los hospitales ahora?" },
  { txt: "💜 ¿Cómo puedo donar?", msg: "¿Cómo puedo donar o ofrecer ayuda?" },
  { txt: "🔎 Buscar a una persona", msg: "Quiero buscar a una persona. ¿Cómo lo hago?" },
  { txt: "❓ ¿Cómo funciona?", msg: "¿Cómo funciona AviHelp?" },
];

const PRIO = ["critica", "alta", "media", "baja"];
const PRIO_LABEL: Record<string, string> = { critica: "Prioridad crítica", alta: "Prioridad alta", media: "Prioridad media", baja: "Prioridad baja" };
const PRIO_PILL: Record<string, string> = {
  critica: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  alta: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  media: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  baja: "bg-muted text-muted-foreground",
};
const selCls = "h-11 px-3 rounded-xl border bg-background text-base";

export function LandingPublico({ insumos }: { insumos: Insumo[] }) {
  const { enviar } = useChat();
  const [prio, setPrio] = useState("todas");
  const [hosp, setHosp] = useState("todos");
  const [donar, setDonar] = useState<Insumo | null>(null);

  const hospitales = useMemo(
    () => [...new Set(insumos.map((i) => i.hospitales?.nombre).filter(Boolean) as string[])].sort(),
    [insumos],
  );
  const filtrados = insumos.filter((i) =>
    (prio === "todas" || i.prioridad === prio) && (hosp === "todos" || i.hospitales?.nombre === hosp));

  return (
    <main className="flex-1 px-4 py-8 bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="max-w-2xl mx-auto flex flex-col items-center text-center mb-6">
        <Logo size={72} />
        <h1 className="mt-3 text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-[#5eead4] bg-clip-text text-transparent">Soy Avi</h1>
        <p className="text-muted-foreground mt-1 max-w-md">Pregúntame qué falta, a quién buscas o cómo donar. Estoy para ayudarte en la emergencia.</p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {CHIPS.map((c) => (
            <button key={c.txt} onClick={() => enviar(c.msg)}
              className="rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted active:scale-95 transition">{c.txt}</button>
          ))}
        </div>
        <div className="h-[min(60vh,460px)] rounded-2xl border bg-card overflow-hidden shadow-sm">
          <ChatPanel className="h-full" />
        </div>
      </div>

      {/* Necesidades: grande, detallado, con filtros y donar directo. */}
      <section className="max-w-2xl mx-auto mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-2xl font-bold">Necesidades ahora</h2>
          <Link href="/ofrecer" className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-base font-semibold">💜 Donar / Ofrecer ayuda</Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select value={prio} onChange={(e) => setPrio(e.target.value)} className={selCls} aria-label="Filtrar por prioridad">
            <option value="todas">Toda prioridad</option>
            {PRIO.map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
          </select>
          <select value={hosp} onChange={(e) => setHosp(e.target.value)} className={`${selCls} max-w-[60%]`} aria-label="Filtrar por hospital">
            <option value="todos">Todos los hospitales</option>
            {hospitales.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-3">
          {filtrados.map((i) => (
            <div key={i.id} className="rounded-2xl border bg-card p-4 flex flex-col gap-2 min-h-[150px]">
              {/* Esquina y esquina: cantidad arriba-izq, donar arriba-der. */}
              <div className="flex items-start justify-between gap-3">
                <p className="text-base">
                  <span className="text-muted-foreground">Cantidad: </span>
                  <span className="font-semibold">{i.cantidad ?? "—"}{i.unidad ? ` ${i.unidad}` : ""}</span>
                </p>
                <Button size="lg" className="shrink-0 text-base" onClick={() => setDonar(i)}>💜 Donar esto</Button>
              </div>
              {/* Nombre + prioridad (subtítulo). */}
              <div>
                <p className="text-xl font-bold leading-tight capitalize">{i.nombre}</p>
                <span className={`inline-block mt-1 rounded-full px-3 py-1 text-sm font-semibold ${PRIO_PILL[i.prioridad] ?? "bg-muted"}`}>
                  {PRIO_LABEL[i.prioridad] ?? i.prioridad}
                </span>
              </div>
              {/* Hospital: esquina inferior izquierda. */}
              {i.hospitales?.nombre && (
                <p className="mt-auto text-base"><span className="text-muted-foreground">Hospital: </span><span className="font-medium">🏥 {i.hospitales.nombre}</span></p>
              )}
            </div>
          ))}
          {filtrados.length === 0 && <p className="p-4 text-base text-muted-foreground">No hay solicitudes con esos filtros.</p>}
        </div>
      </section>

      <p className="max-w-2xl mx-auto mt-8 text-center text-base text-muted-foreground">
        ¿Eres personal de salud, ONG o voluntario?{" "}
        <Link href="/login" className="text-primary underline font-medium">Inicia sesión</Link>{" "}para registrar personas, gestionar insumos y ver más.
      </p>

      {donar && <DonarModal insumo={donar} onClose={() => setDonar(null)} />}
    </main>
  );
}

function DonarModal({ insumo, onClose }: { insumo: Insumo; onClose: () => void }) {
  const [f, setF] = useState({ cantidad: String(insumo.cantidad ?? ""), nombre: "", telefono: "", email: "" });
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ centros: any[]; hospital: any } | null>(null);

  async function enviar() {
    setGuardando(true);
    const r = await donarNecesidad(insumo.id, {
      cantidad: Number(f.cantidad), nombre: f.nombre, telefono: f.telefono, email: f.email,
    });
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("¡Gracias! Tu donación quedó registrada.");
    setResultado({ centros: r.centros ?? [], hospital: r.hospital });
  }

  const mapsUrl = (c: any) =>
    c.gps_lat != null && c.gps_lng != null
      ? `https://www.google.com/maps?q=${c.gps_lat},${c.gps_lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent(`${c.nombre} ${c.ubicacion ?? c.zona ?? ""} Venezuela`)}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-md">
        <DialogHeader><DialogTitle className="text-xl pr-8">💜 Donar: <span className="capitalize">{insumo.nombre}</span></DialogTitle></DialogHeader>

        {!resultado ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Déjanos tus datos para coordinar la entrega. No necesitas cuenta.</p>
            <label className="flex flex-col gap-1 text-sm font-medium">¿Cuánto donarás?
              <Input inputMode="numeric" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} placeholder={String(insumo.cantidad ?? "")} className="h-11 text-base" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Tu nombre
              <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="h-11 text-base" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Teléfono (WhatsApp) *
              <Input type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="+58…" className="h-11 text-base" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Correo
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="h-11 text-base" />
            </label>
            <p className="text-xs text-muted-foreground">Te contactaremos para coordinar (próximamente por WhatsApp).</p>
            <DialogFooter><Button size="lg" onClick={enviar} disabled={guardando} className="w-full">{guardando ? "Registrando…" : "Registrar mi donación"}</Button></DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-base">✅ ¡Gracias! Avisamos al hospital{resultado.centros.length ? " y a sus centros de acopio" : ""}.</p>
            {resultado.centros.length > 0 ? (
              <>
                <p className="font-semibold">Lleva tu donación a:</p>
                {resultado.centros.map((c: any) => (
                  <div key={c.id} className="rounded-xl border p-3">
                    <p className="font-medium">📦 {c.nombre}</p>
                    {(c.zona || c.ubicacion) && <p className="text-sm text-muted-foreground">📍 {[c.zona, c.ubicacion].filter(Boolean).join(" · ")}</p>}
                    {c.horario && <p className="text-sm text-muted-foreground">🕑 {c.horario}</p>}
                    <div className="flex gap-2 mt-2">
                      <a href={mapsUrl(c)} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">🗺️ Cómo llegar</a>
                      {c.contacto_telefono && <a href={`tel:${c.contacto_telefono}`} className="flex-1 text-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">📞 Llamar</a>}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aún no hay un centro de acopio asignado a {resultado.hospital?.nombre ?? "este hospital"}. El equipo te contactará para coordinar la entrega.
              </p>
            )}
            <DialogFooter><Button size="lg" variant="outline" onClick={onClose} className="w-full">Cerrar</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
