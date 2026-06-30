"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { donarNecesidad, lugaresEntrega } from "@/app/actions/donaciones";
import { createClient } from "@/lib/supabase/client";
import { PasswordModal } from "@/app/donaciones/crear/PasswordModal";

export type InsumoDonable = {
  id: string; nombre: string; cantidad: number | null; unidad: string | null;
  presentacion: string | null; hospital_id: string | null; hospitales?: { nombre: string } | null;
};

// Presentación legible (pastilla, ml, ampolla…). "otro" -> usa la unidad.
export const presentacionDe = (i: { presentacion: string | null; unidad: string | null }) =>
  (i.presentacion && i.presentacion !== "otro" ? i.presentacion : i.unidad) || null;

// Botón "Donar esto" + modal de registro/entrega. Reutilizable (landing y chat).
export function DonarBoton({ insumo, className = "" }: { insumo: InsumoDonable; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button size="lg" className={`text-base ${className}`} onClick={() => setAbierto(true)}>💜 Donar esto</Button>
      {abierto && <DonarModal insumo={insumo} onClose={() => setAbierto(false)} />}
    </>
  );
}

const mapsUrl = (c: any) =>
  c.gps_lat != null && c.gps_lng != null
    ? `https://www.google.com/maps?q=${c.gps_lat},${c.gps_lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent(`${c.nombre} ${c.ubicacion ?? c.zona ?? ""} Venezuela`)}`;

export function DonarModal({ insumo, onClose }: { insumo: InsumoDonable; onClose: () => void }) {
  const minimo = 1;
  const [f, setF] = useState({ cantidad: String(insumo.cantidad ?? minimo), nombre: "", telefono: "", email: "" });
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ centros: any[]; hospital: any } | null>(null);
  const [centrosPrev, setCentrosPrev] = useState<any[]>([]);
  const [autenticado, setAutenticado] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (insumo.hospital_id) lugaresEntrega(insumo.hospital_id).then((c) => setCentrosPrev(c ?? []));
  }, [insumo.hospital_id]);
  useEffect(() => { createClient().auth.getUser().then(({ data }) => setAutenticado(!!data.user)).catch(() => {}); }, []);

  async function registrar() {
    const cant = Math.floor(Number(f.cantidad));
    setGuardando(true);
    const r = await donarNecesidad(insumo.id, { cantidad: cant, nombre: f.nombre, telefono: f.telefono, email: f.email });
    setGuardando(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("¡Gracias! Tu donación quedó registrada.");
    setResultado({ centros: r.centros ?? [], hospital: r.hospital });
  }

  // FIX NEVER-ORPHAN: si es anónimo y dejó correo+teléfono, ofrece cuenta antes de registrar.
  async function enviar() {
    const cant = Math.floor(Number(f.cantidad));
    if (!Number.isFinite(cant) || cant < minimo) { toast.error(`La cantidad mínima es ${minimo}.`); return; }
    if (!autenticado && f.email.trim() && f.telefono.trim()) { setPwOpen(true); return; }
    registrar();
  }

  const pres = presentacionDe(insumo);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-md">
        <DialogHeader><DialogTitle className="text-xl pr-8">💜 Donar: <span className="capitalize">{insumo.nombre}</span></DialogTitle></DialogHeader>

        {!resultado ? (
          <div className="flex flex-col gap-3">
            {insumo.hospitales?.nombre && (
              <p className="text-base rounded-lg bg-primary/5 border px-3 py-2">🏥 Para: <span className="font-semibold">{insumo.hospitales.nombre}</span></p>
            )}
            <p className="text-sm text-muted-foreground">Déjanos tus datos para coordinar la entrega. No necesitas cuenta.</p>
            <label className="flex flex-col gap-1 text-sm font-medium">¿Cuánto donarás? <span className="text-xs font-normal text-muted-foreground">(solicitado: {insumo.cantidad ?? "—"}{pres ? ` ${pres}` : ""})</span>
              <div className="flex items-center gap-2">
                <Input type="number" min={minimo} step={1} value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} placeholder={String(insumo.cantidad ?? minimo)} className="h-11 text-base flex-1" />
                {pres && <span className="rounded-lg bg-primary/10 text-primary px-3 py-2 text-sm font-semibold capitalize whitespace-nowrap">💊 {pres}</span>}
              </div>
            </label>

            {centrosPrev.length > 0 && (
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-sm font-semibold mb-1">📦 La entregas en (más cercanos):</p>
                <div className="flex flex-col gap-2">
                  {centrosPrev.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{c.tipo === "Refugio" ? "🏠" : "📦"} {c.nombre}</span>
                        {(c.zona || c.ubicacion) && <span className="text-muted-foreground"> · {[c.zona, c.ubicacion].filter(Boolean).join(" · ")}</span>}
                      </span>
                      <a href={mapsUrl(c)} target="_blank" rel="noreferrer" className="shrink-0 text-primary underline">mapa</a>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            <p className="text-base">✅ ¡Gracias! Avisamos al hospital{resultado.centros.length ? " y a los lugares de entrega cercanos" : ""}.</p>
            {resultado.centros.length > 0 ? (
              <>
                <p className="font-semibold">Lleva tu donación a (más cercano):</p>
                {resultado.centros.map((c: any) => (
                  <div key={c.id} className="rounded-xl border p-3">
                    <p className="font-medium">{c.tipo === "Refugio" ? "🏠" : "📦"} {c.nombre} <span className="text-xs font-normal text-muted-foreground">· {c.tipo}</span></p>
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
              <p className="text-sm text-muted-foreground">Aún no hay un lugar de entrega asignado a {resultado.hospital?.nombre ?? "este hospital"}. El equipo te contactará para coordinar.</p>
            )}
            <DialogFooter><Button size="lg" variant="outline" onClick={onClose} className="w-full">Cerrar</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
      {pwOpen && (
        <PasswordModal
          email={f.email.trim()} nombre={f.nombre} telefono={f.telefono}
          onAuthed={() => { setPwOpen(false); setAutenticado(true); registrar(); }}
          onSkip={() => { setPwOpen(false); registrar(); }}
          onClose={() => setPwOpen(false)}
        />
      )}
    </Dialog>
  );
}
