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

// Distancia aproximada en km (Haversine) — para acotar el mapa a lo CERCANO.
function distKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// FIX 32: radio para considerar un centro "cercano". Evita encuadrar puntos lejanos
// (datos con coordenadas erróneas en otro país) que hacían ver Miami y Bogotá a la vez.
const RADIO_CERCANO_KM = 80;
const MAX_ZOOM_ENCUADRE = 14;

// Centros dentro del radio de un punto; si ninguno cae dentro, los 5 más cercanos.
function centrosCercanos(centros: CentroPin[], lat: number, lng: number): CentroPin[] {
  const conD = centros
    .filter((p) => Number.isFinite(p.gps_lat) && Number.isFinite(p.gps_lng))
    .map((p) => ({ p, d: distKm(lat, lng, p.gps_lat as number, p.gps_lng as number) }))
    .sort((a, b) => a.d - b.d);
  const dentro = conD.filter((x) => x.d <= RADIO_CERCANO_KM);
  return (dentro.length ? dentro : conD.slice(0, 5)).map((x) => x.p);
}
// Sin ubicación del usuario: descarta puntos atípicos (lejos de la mediana) para que un
// dato con coordenadas erróneas no obligue a alejar el mapa a escala continental.
function sinOutliers(centros: CentroPin[]): CentroPin[] {
  const con = centros.filter((p) => Number.isFinite(p.gps_lat) && Number.isFinite(p.gps_lng));
  if (con.length <= 2) return con;
  const med = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const mLat = med(con.map((p) => p.gps_lat as number)), mLng = med(con.map((p) => p.gps_lng as number));
  const cerca = con.filter((p) => distKm(mLat, mLng, p.gps_lat as number, p.gps_lng as number) <= 150);
  return cerca.length ? cerca : con;
}

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
  const roRef = useRef<any>(null);
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const selRef = useRef<string[]>(selectedIds);
  selRef.current = selectedIds;
  const userPosRef = useRef(userPos);
  userPosRef.current = userPos;

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
      // FIX 32: encuadre inicial CENTRADO en el usuario (si ya tenemos su ubicación) y solo
      // con los centros cercanos; sin ubicación, ajusta a los centros descartando atípicos.
      const encuadrar = () => {
        const up = userPosRef.current;
        if (up) {
          const cerca = centrosCercanos(centros, up.lat, up.lng);
          const pts: [number, number][] = [[up.lat, up.lng], ...cerca.map((p) => [p.gps_lat as number, p.gps_lng as number] as [number, number])];
          if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: MAX_ZOOM_ENCUADRE });
          else map.setView([up.lat, up.lng], 13);
          return;
        }
        const visibles = sinOutliers(conCoord);
        if (visibles.length > 1) map.fitBounds(L.latLngBounds(visibles.map((p) => [p.gps_lat as number, p.gps_lng as number])).pad(0.25), { maxZoom: MAX_ZOOM_ENCUADRE });
        else if (visibles.length === 1) map.setView([visibles[0].gps_lat as number, visibles[0].gps_lng as number], 13);
      };
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
      encuadrar();
      mapRef.current = map;
      // FIX 6: recalcula el tamaño tras montar (el contenedor puede terminar su layout
      // después) y ante cualquier resize, para que las teselas no queden a medio pintar.
      const fix = () => { try { map.invalidateSize(); } catch { /* mapa removido */ } };
      setTimeout(fix, 60); setTimeout(fix, 300);
      if (typeof ResizeObserver !== "undefined" && elRef.current) {
        roRef.current = new ResizeObserver(fix);
        roRef.current.observe(elRef.current);
      }
    })();
    return () => { cancelado = true; roRef.current?.disconnect?.(); roRef.current = null; mapRef.current?.remove(); mapRef.current = null; markersRef.current = {}; userMarkerRef.current = null; lineRef.current = null; };
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
      map.fitBounds(L.latLngBounds([[userPos.lat, userPos.lng], [routeTo.gps_lat, routeTo.gps_lng]]).pad(0.3), { maxZoom: MAX_ZOOM_ENCUADRE });
    } else if (userPos) {
      // FIX 32: al ubicarse, centra en el usuario y acota a los centros CERCANOS (no a todos).
      const cerca = centrosCercanos(centros, userPos.lat, userPos.lng);
      const pts: [number, number][] = [[userPos.lat, userPos.lng], ...cerca.map((p) => [p.gps_lat as number, p.gps_lng as number] as [number, number])];
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: MAX_ZOOM_ENCUADRE });
      else map.setView([userPos.lat, userPos.lng], 13);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos, routeTo]);

  return <div ref={elRef} role="application" aria-label="Mapa de centros de entrega" className={`w-full h-full ${className}`} />;
}

export default MapaEntrega;
