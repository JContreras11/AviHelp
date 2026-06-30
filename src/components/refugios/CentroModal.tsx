"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DonarBoton, type InsumoDonable } from "@/components/DonarInsumo";
import { InsumoDialog } from "@/components/datos/Detalle";
import { openAvi } from "@/lib/avi-bus";
import { useRol } from "@/lib/rol";

// Leaflet toca window -> solo cliente.
const MapaRuta = dynamic(() => import("./MapaRuta").then((m) => m.MapaRuta), {
  ssr: false,
  loading: () => <div className="aspect-[16/10] grid place-items-center text-sm text-muted-foreground rounded-xl border">Cargando mapa…</div>,
});

export type Centro = {
  id: string; nombre: string; tipo?: string | null; ubicacion: string | null;
  gps_lat?: number | null; gps_lng?: number | null;
  contacto?: string | null;
  responsable_recepcion_nombre?: string | null;
  responsable_recepcion_contacto?: string | null;
};
export type Need = {
  id: string; hospital_id: string; nombre: string; cantidad: number | null;
  unidad: string | null; presentacion?: string | null; area: string | null; prioridad: string; estado: string;
};

// Etiquetas en lenguaje sencillo (sin tecnicismos): qué es cada lugar.
export const TIPO_INFO: Record<string, { icon: string; label: string }> = {
  refugio: { icon: "🏠", label: "Refugio (resguarda personas)" },
  hospital: { icon: "🏥", label: "Hospital" },
  clinica: { icon: "🏥", label: "Clínica" },
  centro: { icon: "📦", label: "Centro de acopio / fundación" },
};
export const tipoInfo = (t?: string | null) => TIPO_INFO[t ?? ""] ?? { icon: "📍", label: t ? t : "Centro de atención" };

const PRIO_CLS: Record<string, string> = {
  critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-800",
  media: "bg-muted text-muted-foreground", baja: "bg-muted text-muted-foreground",
};

const mapsBusca = (c: Centro) => encodeURIComponent(`${c.nombre}, ${c.ubicacion ?? ""}, Venezuela`);
const comoLlegar = (c: Centro) =>
  c.gps_lat != null && c.gps_lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.gps_lat},${c.gps_lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${mapsBusca(c)}`;

export function CentroModal({ centro, needs, onClose }: { centro: Centro; needs: Need[]; onClose: () => void }) {
  const { gestiona } = useRol();
  const puedeGestionar = gestiona(centro.id);
  const [verDonacionesDe, setVerDonacionesDe] = useState<string | null>(null);
  const info = tipoInfo(centro.tipo);
  const tieneCoord = centro.gps_lat != null && centro.gps_lng != null;

  // Abre Avi con el flujo de solicitud prellenado para ESTE centro. El usuario puede
  // añadir fotos/voz/documentos dentro del chat (patrón reutilizable openAvi).
  function solicitarConAvi() {
    openAvi({
      flow: "solicitud",
      message: `Quiero registrar una solicitud de insumos para ${centro.nombre}${centro.ubicacion ? ` (${centro.ubicacion})` : ""}. `,
    });
    onClose();
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl pr-8 leading-tight">
              {info.icon} {centro.nombre}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Columna izquierda: info + ruta */}
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border bg-muted/30 p-3 text-sm flex flex-col gap-1">
                <p><span className="text-muted-foreground">Tipo: </span>{info.label}</p>
                {centro.ubicacion && <p><span className="text-muted-foreground">Dirección: </span>{centro.ubicacion}</p>}
                {centro.contacto && <p><span className="text-muted-foreground">Contacto: </span>{centro.contacto}</p>}
                {(centro.responsable_recepcion_nombre || centro.responsable_recepcion_contacto) && (
                  <p><span className="text-muted-foreground">Recibe ayuda: </span>
                    {[centro.responsable_recepcion_nombre, centro.responsable_recepcion_contacto].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              {tieneCoord ? (
                <MapaRuta destino={{ nombre: centro.nombre, gps_lat: centro.gps_lat as number, gps_lng: centro.gps_lng as number }} />
              ) : (
                <p className="text-sm text-muted-foreground rounded-xl border p-3">
                  Este lugar aún no tiene coordenadas en el mapa. Usa “Cómo llegar” para buscarlo por su dirección.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <a href={comoLlegar(centro)} target="_blank" rel="noreferrer"
                  className="text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted active:scale-[0.98] transition">🧭 Cómo llegar</a>
                {centro.contacto ? (
                  <a href={`tel:${centro.contacto}`} className="text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted active:scale-[0.98] transition">📞 Llamar</a>
                ) : (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapsBusca(centro)}`} target="_blank" rel="noreferrer"
                    className="text-center rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted active:scale-[0.98] transition">🗺️ Ver mapa</a>
                )}
              </div>
            </div>

            {/* Columna derecha: necesidades + acciones */}
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold mb-2">Qué necesita ahora ({needs.length})</p>
                {needs.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-xl border p-3">Sin solicitudes activas en este momento.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {needs.map((n) => {
                      const donable: InsumoDonable = {
                        id: n.id, nombre: n.nombre, cantidad: n.cantidad, unidad: n.unidad,
                        presentacion: n.presentacion ?? null, hospital_id: n.hospital_id, hospitales: { nombre: centro.nombre },
                      };
                      return (
                        <li key={n.id} className="rounded-xl border p-3 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="font-medium block">{n.nombre}</span>
                              <span className="text-xs text-muted-foreground">
                                {[n.cantidad ? `${n.cantidad}${n.unidad ? " " + n.unidad : ""}` : null, n.area].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${PRIO_CLS[n.prioridad] ?? "bg-muted"}`}>{n.prioridad}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <DonarBoton insumo={donable} className="flex-1 min-w-[120px] !h-10" />
                            <Button size="sm" variant="outline" className="flex-1 min-w-[120px] h-10" onClick={() => setVerDonacionesDe(n.id)}>
                              📦 Ver donaciones
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Acciones rápidas a este centro (según rol). Crear solicitud SIEMPRE reutiliza Avi. */}
              <div className="rounded-xl border bg-primary/5 p-3 flex flex-col gap-2">
                <p className="text-sm font-semibold">Acciones</p>
                <Button onClick={solicitarConAvi} className="w-full h-11 text-base">
                  ✍️ Pedir un insumo con Avi
                </Button>
                <p className="text-xs text-muted-foreground">
                  {puedeGestionar
                    ? "Avi abre el formulario guiado: puedes dictar, escribir o subir una foto del pedido."
                    : "Avi te ayuda a registrar lo que hace falta en este lugar (con foto, voz o texto)."}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reusa el diálogo de insumo (donaciones + tracking + conciliación) del lane de datos. */}
      {verDonacionesDe && (
        <InsumoDialog id={verDonacionesDe} onClose={() => setVerDonacionesDe(null)} onChanged={() => {}} />
      )}
    </>
  );
}

export default CentroModal;
