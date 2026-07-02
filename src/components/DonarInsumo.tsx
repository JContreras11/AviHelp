"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { donarNecesidad, lugaresEntrega, perfilContacto, type LugarEntrega } from "@/app/actions/donaciones";
import { createClient } from "@/lib/supabase/client";
import { PasswordModal } from "@/app/donaciones/crear/PasswordModal";

// Leaflet toca window -> sólo cliente. Reutiliza el mapa de ruta del wizard/refugios.
const MapaRuta = dynamic(() => import("@/components/refugios/MapaRuta").then((m) => m.MapaRuta), {
  ssr: false,
  loading: () => <div className="aspect-[16/10] grid place-items-center text-sm text-muted-foreground rounded-xl border">Cargando mapa…</div>,
});
const MapaRefugios = dynamic(() => import("@/components/refugios/MapaRefugios").then((m) => m.MapaRefugios), {
  ssr: false,
  loading: () => <div className="aspect-[16/10] grid place-items-center text-sm text-muted-foreground rounded-xl border">Cargando mapa…</div>,
});

// Icono por tipo de institución (fuente única = hospitales).
const iconoLugar = (c: { tipo?: string | null; esHospital?: boolean }) =>
  c.esHospital ? "🏥" : c.tipo === "refugio" ? "🏠" : c.tipo === "centro" ? "📦" : c.tipo === "hospital" || c.tipo === "clinica" ? "🏥" : "📍";
const kmTexto = (km: number | null | undefined) =>
  km == null ? null : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

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
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.gps_lat},${c.gps_lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${c.nombre} ${c.ubicacion ?? c.zona ?? ""} Venezuela`)}`;

export function DonarModal({
  insumo,
  edicion = null,
  onClose,
  onChanged,
}: {
  insumo: InsumoDonable;
  edicion?: {
    id: string;
    tipoOrigen: "oferta" | "donacion";
    cantidad: number;
    nombre: string;
    telefono: string;
    email: string;
    lugarEntregaId: string | null;
  } | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const minimo = 1;
  const [f, setF] = useState({
    cantidad: String(edicion ? edicion.cantidad : (insumo.cantidad ?? minimo)),
    nombre: edicion ? edicion.nombre : "",
    telefono: edicion ? edicion.telefono : "",
    email: edicion ? edicion.email : "",
  });
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ centros: LugarEntrega[]; hospital: any } | null>(null);
  const [centrosPrev, setCentrosPrev] = useState<LugarEntrega[]>([]);
  const [autenticado, setAutenticado] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [dup, setDup] = useState<{ id: string; cantidad: number } | null>(null);

  // States for delivery selection and interactive map
  const [lugarRadioId, setLugarRadioId] = useState<string>(edicion?.lugarEntregaId || "");
  const [selectedLugarId, setSelectedLugarId] = useState<string | null>(edicion?.lugarEntregaId || null);

  useEffect(() => {
    if (insumo.hospital_id) {
      lugaresEntrega(insumo.hospital_id).then((c) => {
        const list = c ?? [];
        setCentrosPrev(list);
        if (list.length > 0) {
          const defaultSel = edicion?.lugarEntregaId && list.some((x) => x.id === edicion.lugarEntregaId)
            ? edicion.lugarEntregaId
            : list[0].id;
          setLugarRadioId(defaultSel);
          setSelectedLugarId(defaultSel);
        }
      });
    }
  }, [insumo.hospital_id, edicion?.lugarEntregaId]);
  useEffect(() => { createClient().auth.getUser().then(({ data }) => setAutenticado(!!data.user)).catch(() => {}); }, []);
  // Logueado: PRE-LLENA nombre/teléfono/correo desde su perfil (editable). Anónimo: en blanco.
  useEffect(() => {
    if (edicion) return; // Don't pre-fill contact details if editing an existing donation
    perfilContacto().then((p) => {
      if (!p) return;
      setF((prev) => ({
        ...prev,
        nombre: prev.nombre || (p.nombre ?? ""),
        telefono: prev.telefono || (p.telefono ?? ""),
        email: prev.email || (p.email ?? ""),
      }));
    }).catch(() => {});
  }, [edicion]);

  async function registrar(modo?: "nueva" | "sumar") {
    const cant = Math.floor(Number(f.cantidad));
    setGuardando(true);
    const r = await donarNecesidad(insumo.id, {
      cantidad: cant,
      nombre: f.nombre,
      telefono: f.telefono,
      email: f.email,
      lugarEntregaId: lugarRadioId || undefined,
    }, modo);
    setGuardando(false);
    // Ya tenías una donación en curso para esta necesidad → ofrece sumar o registrar aparte.
    if (!r.ok && (r as any).yaExiste) { setDup((r as any).yaExiste); return; }
    if (!r.ok) { toast.error(r.error); return; }
    setDup(null);
    toast.success((r as any).sumado ? "Sumado a tu donación anterior. ¡Gracias!" : "¡Gracias! Tu donación quedó registrada.");
    setResultado({ centros: r.centros ?? [], hospital: r.hospital });
  }

  async function guardarCambiosEdicion() {
    const cant = Math.floor(Number(f.cantidad));
    if (!Number.isFinite(cant) || cant < minimo) { toast.error(`La cantidad mínima es ${minimo}.`); return; }
    if (!f.nombre.trim()) { toast.error("El nombre es obligatorio."); return; }

    setGuardando(true);
    const { guardarEdicionDonacion } = await import("@/app/actions/donaciones");
    const r = await guardarEdicionDonacion(edicion!.id, edicion!.tipoOrigen, {
      cantidad: cant,
      nombre: f.nombre,
      telefono: f.telefono,
      email: f.email,
      lugarEntregaId: lugarRadioId || undefined,
    });
    setGuardando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    toast.success("Donación actualizada con éxito.");
    onClose();
    if (onChanged) onChanged();
  }

  // FIX NEVER-ORPHAN: si es anónimo y dejó correo+teléfono, ofrece cuenta antes de registrar.
  async function enviar() {
    const cant = Math.floor(Number(f.cantidad));
    if (!Number.isFinite(cant) || cant < minimo) { toast.error(`La cantidad mínima es ${minimo}.`); return; }
    if (!autenticado && f.email.trim() && f.telefono.trim()) { setPwOpen(true); return; }
    registrar();
  }

  // "Donar algo más": vuelve al formulario limpio (mismo insumo) sin cerrar el modal.
  function donarMas() {
    setResultado(null);
    setF({ cantidad: String(insumo.cantidad ?? minimo), nombre: f.nombre, telefono: f.telefono, email: f.email });
  }

  const pres = presentacionDe(insumo);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-4xl w-full">
        <DialogHeader><DialogTitle className="text-xl pr-8">💜 {edicion ? "Editar donación:" : "Donar:"} <span className="capitalize">{insumo.nombre}</span></DialogTitle></DialogHeader>

        {!resultado ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Form & Checklist */}
            <div className="flex flex-col gap-3">
              {insumo.hospitales?.nombre && (
                <p className="text-sm rounded-lg bg-primary/5 border px-3 py-1.5">🏥 Para: <span className="font-semibold">{insumo.hospitales.nombre}</span></p>
              )}
              <p className="text-xs text-muted-foreground">Déjanos tus datos para coordinar la entrega. No necesitas cuenta.</p>
              
              <label className="flex flex-col gap-1 text-sm font-medium">¿Cuánto donarás? <span className="text-xs font-normal text-muted-foreground">(solicitado: {insumo.cantidad ?? "—"}{pres ? ` ${pres}` : ""})</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min={minimo} step={1} value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} placeholder={String(insumo.cantidad ?? minimo)} className="h-11 text-base flex-1" />
                  {pres && <span className="rounded-lg bg-primary/10 text-primary px-3 py-2 text-sm font-semibold capitalize whitespace-nowrap">💊 {pres}</span>}
                </div>
              </label>

              {centrosPrev.length > 0 && (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-semibold mb-1 text-muted-foreground">📦 ¿Dónde entregarás la donación? (Elige un sitio):</p>
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-auto">
                    {centrosPrev.map((c) => (
                      <label
                        key={c.id}
                        onClick={() => setSelectedLugarId(c.id)}
                        className={`flex items-start gap-2 p-1.5 rounded-lg cursor-pointer hover:bg-muted/60 transition ${selectedLugarId === c.id ? "bg-muted/40" : ""}`}
                      >
                        <input
                          type="radio"
                          name="lugar_entrega"
                          checked={lugarRadioId === c.id}
                          onChange={() => {
                            setLugarRadioId(c.id);
                            setSelectedLugarId(c.id);
                          }}
                          className="mt-0.5 size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="font-medium text-foreground">{iconoLugar(c)} {c.nombre}</span>
                          {c.esHospital && <span className="text-xs text-primary font-semibold"> · el hospital mismo</span>}
                          {c.ubicacion && <span className="block text-muted-foreground mt-0.5">📍 {c.ubicacion}</span>}
                        </span>
                        <a
                          href={mapsUrl(c)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 text-xs text-primary underline ml-1"
                        >
                          mapa
                        </a>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex flex-col gap-0.5 text-xs font-medium text-muted-foreground">Tu nombre
                <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="h-10 text-sm" />
              </label>
              <label className="flex flex-col gap-0.5 text-xs font-medium text-muted-foreground">Teléfono (WhatsApp) *
                <Input type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="+58…" className="h-10 text-sm" />
              </label>
              <label className="flex flex-col gap-0.5 text-xs font-medium text-muted-foreground">Correo
                <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="h-10 text-sm" />
              </label>
              <p className="text-[11px] text-muted-foreground">Te contactaremos para coordinar la entrega física.</p>
              {dup ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-col gap-2">
                  <p className="text-sm text-amber-800">Ya tienes una donación en curso de <b>{dup.cantidad}</b> para esta necesidad. ¿Qué prefieres?</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button size="lg" onClick={() => registrar("sumar")} disabled={guardando} className="flex-1">➕ Sumar {f.cantidad} (total {(dup.cantidad || 0) + (Math.floor(Number(f.cantidad)) || 0)})</Button>
                    <Button size="lg" variant="outline" onClick={() => registrar("nueva")} disabled={guardando} className="flex-1">Registrar aparte</Button>
                  </div>
                  <button type="button" onClick={() => setDup(null)} className="text-xs text-muted-foreground underline self-start">Cancelar</button>
                </div>
              ) : (
                <DialogFooter className="mt-1"><Button size="lg" onClick={edicion ? guardarCambiosEdicion : enviar} disabled={guardando} className="w-full">{guardando ? (edicion ? "Guardando…" : "Registrando…") : edicion ? "Guardar cambios" : "Registrar mi donación"}</Button></DialogFooter>
              )}
            </div>

            {/* Right Column: Leaflet Map */}
            <div className="flex flex-col gap-2 h-64 md:h-auto min-h-[250px]">
              <p className="text-xs font-semibold text-muted-foreground">📍 Mapa de localizaciones:</p>
              <div className="flex-1 relative z-0 isolate rounded-xl border overflow-hidden">
                {centrosPrev.length > 0 ? (
                  <MapaRefugios
                    pins={centrosPrev}
                    sel={selectedLugarId}
                    onSelect={(id) => {
                      setSelectedLugarId(id);
                      setLugarRadioId(id);
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
                    Sin puntos de entrega disponibles
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (() => {
          // Lugar recomendado = primero con coordenadas (más cercano); si no, el primero.
          const primario = resultado.centros.find((c) => c.gps_lat != null && c.gps_lng != null) ?? resultado.centros[0];
          const otros = resultado.centros.filter((c) => c.id !== primario?.id);
          return (
          <div className="flex flex-col gap-3 max-w-lg mx-auto">
            <div className="text-center flex flex-col items-center gap-0.5">
              <span className="text-4xl">💜</span>
              <p className="text-lg font-bold">¡Gracias! Tu donación quedó registrada.</p>
              <p className="text-sm text-muted-foreground">Avisamos al hospital y a los lugares de entrega cercanos.</p>
            </div>

            {/* Qué llevar */}
            <div className="rounded-xl border bg-primary/5 p-3">
              <p className="text-sm font-semibold">Qué llevar</p>
              <p className="text-base"><span className="font-medium">{f.cantidad}{pres ? ` ${pres}` : ""}</span> · <span className="capitalize">{insumo.nombre}</span></p>
              {insumo.hospitales?.nombre && <p className="text-sm text-muted-foreground">🏥 Para {insumo.hospitales.nombre}</p>}
            </div>

            {/* Lugar recomendado + mapa con ruta desde tu ubicación */}
            {primario && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold">📍 Lleva tu donación a (más cercano):</p>
                <p className="text-base font-medium">{iconoLugar(primario)} {primario.nombre}
                  {primario.esHospital && <span className="text-sm text-primary font-semibold"> · el hospital mismo</span>}
                </p>
                {primario.ubicacion && <p className="text-sm text-muted-foreground">📍 {primario.ubicacion}</p>}
                {primario.gps_lat != null && primario.gps_lng != null && (
                  <MapaRuta destino={{ nombre: primario.nombre, gps_lat: primario.gps_lat, gps_lng: primario.gps_lng }} />
                )}
                <div className="flex gap-2 mt-1">
                  <a href={mapsUrl(primario)} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">🗺️ Cómo llegar</a>
                  {primario.contacto && <a href={`tel:${primario.contacto}`} className="flex-1 text-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">📞 Llamar</a>}
                </div>
              </div>
            )}

            {/* Otros lugares de entrega cercanos */}
            {otros.length > 0 && (
              <div className="rounded-xl border p-3 flex flex-col gap-2">
                <p className="text-sm font-semibold">Otros lugares de entrega cercanos:</p>
                {otros.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{iconoLugar(c)} {c.nombre}</span>
                      {c.esHospital && <span className="text-xs text-primary font-semibold"> · el hospital mismo</span>}
                      {c.ubicacion && <span className="block text-xs text-muted-foreground">📍 {c.ubicacion}</span>}
                    </span>
                    <a href={mapsUrl(c)} target="_blank" rel="noreferrer" className="shrink-0 text-primary underline">mapa</a>
                  </div>
                ))}
              </div>
            )}

            {/* CTAs SIEMPRE: donar más / ver mis donaciones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <Button size="lg" variant="outline" onClick={donarMas} className="w-full">💜 Donar algo más</Button>
              <Link href="/donaciones" className={`${buttonVariants({ size: "lg" })} w-full`}>Ver mis donaciones →</Link>
            </div>
          </div>
          );
        })()}
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
