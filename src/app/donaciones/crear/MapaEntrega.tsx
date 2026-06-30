"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Mapa de ENTREGA propio del flujo de donaciones (NO edita los mapas de Agente G).
// Replica el patrón Leaflet del proyecto (import dinámico, divIcon — sin assets ni libs).
// Comportamiento (FIX 4/5/6):
//   - Al seleccionar centros, los seleccionados se ven a tamaño completo; el resto se
//     encoge (scale) y al pasar el cursor (hover) recupera tamaño y sigue siendo clicable.
//   - Muestra los centros cercanos aunque no estén "asignados".
//   - Con la ubicación del usuario, dibuja una ruta aproximada (línea) hacia el destino.

export type CentroPin = { id: string; nombre: string; ubicacion?: string | null; gps_lat: number | null; gps_lng: number | null };
const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

// Pin con escala. sel=full, no-sel=encogido; data-id para hover.
function pinHtml(p: CentroPin, sel: boolean) {
  const size = sel ? 32 : 20, op = sel ? 1 : 0.7;
  return `<div class="mapa-entrega-pin" data-id="${esc(p.id)}" style="font-size:${size}px;line-height:1;opacity:${op};transform-origin:bottom center;transition:transform .15s,opacity .15s;cursor:pointer;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">📍</div>`;
}
function tipHtml(p: CentroPin, sel: boolean) {
  return `<div style="font-size:12px;line-height:1.3">
    <div style="font-weight:700">${sel ? "✅ " : ""}${esc(p.nombre)}</div>
    ${p.ubicacion ? `<div style="color:#444">📍 ${esc(p.ubicacion)}</div>` : ""}
  </div>`;
}

export function MapaEntrega({
  centros, userPos, selectedIds, onToggle, routeTo, className = "",
}: {
  centros: CentroPin[];
  userPos: { lat: number; lng: number } | null;
  selectedIds: string[];
  onToggle: (id: string) => void;
  routeTo?: CentroPin | null;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const userMarkerRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const selRef = useRef<string[]>(selectedIds);
  selRef.current = selectedIds;

  // Crea el mapa + marcadores una vez (depende solo de la lista de centros).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      let L;
      try { L = (await import("leaflet")).default; } catch { return; }
      if (cancelado || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const conCoord = centros.filter((p) => Number.isFinite(p.gps_lat) && Number.isFinite(p.gps_lng));
      const map = L.map(elRef.current, { scrollWheelZoom: true }).setView([10.5, -66.9], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      for (const p of conCoord) {
        const sel = selRef.current.includes(p.id);
        const m = L.marker([p.gps_lat as number, p.gps_lng as number], {
          icon: L.divIcon({ html: pinHtml(p, sel), className: "", iconSize: [0, 0] }),
        }).addTo(map);
        m.bindTooltip(tipHtml(p, sel), { permanent: false, direction: "top", offset: [0, -18], opacity: 1, className: "refugio-tip" });
        m.on("click", () => onToggleRef.current(p.id));
        // Hover: el pin encogido recupera tamaño (FIX 4) — manipula el DOM del divIcon.
        m.on("mouseover", () => { const el = m.getElement()?.querySelector?.(".mapa-entrega-pin") as HTMLElement | null; if (el) { el.style.transform = "scale(1.6)"; el.style.opacity = "1"; } });
        m.on("mouseout", () => { const el = m.getElement()?.querySelector?.(".mapa-entrega-pin") as HTMLElement | null; if (el && !selRef.current.includes(p.id)) { el.style.transform = ""; el.style.opacity = "0.7"; } });
        markersRef.current[p.id] = m;
      }
      if (conCoord.length) map.fitBounds(L.latLngBounds(conCoord.map((p) => [p.gps_lat as number, p.gps_lng as number])).pad(0.25));
      mapRef.current = map;
    })();
    return () => { cancelado = true; mapRef.current?.remove(); mapRef.current = null; markersRef.current = {}; userMarkerRef.current = null; lineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centros.map((c) => c.id).join("|")]);

  // Re-pinta marcadores según selección (full vs encogido).
  useEffect(() => {
    const L = LRef.current; if (!L) return;
    for (const p of centros) {
      const m = markersRef.current[p.id]; if (!m) continue;
      const sel = selectedIds.includes(p.id);
      m.setIcon(L.divIcon({ html: pinHtml(p, sel), className: "", iconSize: [0, 0] }));
      m.setTooltipContent?.(tipHtml(p, sel));
    }
  }, [selectedIds, centros]);

  // Marcador del usuario + ruta (línea) al destino (FIX 5).
  useEffect(() => {
    const map = mapRef.current, L = LRef.current; if (!map || !L) return;
    if (userMarkerRef.current) { map.removeLayer(userMarkerRef.current); userMarkerRef.current = null; }
    if (lineRef.current) { map.removeLayer(lineRef.current); lineRef.current = null; }
    if (userPos) {
      userMarkerRef.current = L.marker([userPos.lat, userPos.lng], {
        icon: L.divIcon({ html: `<div style="font-size:24px;line-height:1;transform:translate(-50%,-100%)">🧍</div>`, className: "", iconSize: [0, 0] }),
      }).addTo(map).bindTooltip("Tú estás aquí", { permanent: false, direction: "bottom", offset: [0, 4], className: "refugio-tip" });
    }
    if (userPos && routeTo && routeTo.gps_lat != null && routeTo.gps_lng != null) {
      lineRef.current = L.polyline([[userPos.lat, userPos.lng], [routeTo.gps_lat, routeTo.gps_lng]], { color: "#7c3aed", weight: 4, opacity: 0.7, dashArray: "8 8" }).addTo(map);
      map.fitBounds(L.latLngBounds([[userPos.lat, userPos.lng], [routeTo.gps_lat, routeTo.gps_lng]]).pad(0.3));
    } else if (userPos) {
      map.setView([userPos.lat, userPos.lng], Math.max(map.getZoom(), 12));
    }
  }, [userPos, routeTo]);

  return <div ref={elRef} role="application" aria-label="Mapa de centros de entrega" className={`w-full h-full ${className}`} />;
}

export default MapaEntrega;
