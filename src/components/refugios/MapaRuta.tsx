"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// Mapa de RUTA: desde MI ubicación hasta un centro de atención. Reusa el patrón
// Leaflet del proyecto (import dinámico, divIcon — sin assets de imagen ni libs nuevas).
// No traza calles (eso requeriría un servicio de routing); dibuja la línea directa
// y deja el botón "Cómo llegar" para la navegación paso a paso en Google Maps.

type Destino = { nombre: string; gps_lat: number; gps_lng: number };

const pin = (emoji: string, big = false) =>
  `<div style="font-size:${big ? 30 : 24}px;line-height:1;transform:translate(-50%,-100%);filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">${emoji}</div>`;

// Distancia Haversine en km (para mostrar "a ~X km").
function distanciaKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function MapaRuta({ destino }: { destino: Destino }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [yo, setYo] = useState<{ lat: number; lng: number } | null>(null);
  const [estado, setEstado] = useState<"pidiendo" | "ok" | "denegado">("pidiendo");

  // Pide la ubicación una sola vez.
  useEffect(() => {
    if (!("geolocation" in navigator)) { setEstado("denegado"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setYo({ lat: p.coords.latitude, lng: p.coords.longitude }); setEstado("ok"); },
      () => setEstado("denegado"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Crea/actualiza el mapa cuando cambian destino o mi ubicación.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      let L;
      try { L = (await import("leaflet")).default; } catch { return; }
      if (cancelado || !elRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current, { scrollWheelZoom: true }).setView([destino.gps_lat, destino.gps_lng], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapRef.current);
      }
      const map = mapRef.current;
      // Limpia capas dinámicas previas (marcadores/línea).
      map.eachLayer((l: any) => { if (!(l.getAttribution && l._url)) map.removeLayer(l); });

      const dest = L.marker([destino.gps_lat, destino.gps_lng], { icon: L.divIcon({ html: pin("📍", true), className: "", iconSize: [0, 0] }) }).addTo(map);
      dest.bindTooltip(`<b>${destino.nombre}</b>`, { permanent: true, direction: "top", offset: [0, -18], className: "refugio-tip" });

      if (yo) {
        L.marker([yo.lat, yo.lng], { icon: L.divIcon({ html: pin("🧍"), className: "", iconSize: [0, 0] }) }).addTo(map)
          .bindTooltip("Tú estás aquí", { permanent: true, direction: "bottom", offset: [0, 4], className: "refugio-tip" });
        L.polyline([[yo.lat, yo.lng], [destino.gps_lat, destino.gps_lng]], { color: "#7c3aed", weight: 4, opacity: 0.7, dashArray: "8 8" }).addTo(map);
        map.fitBounds(L.latLngBounds([[yo.lat, yo.lng], [destino.gps_lat, destino.gps_lng]]).pad(0.3));
      } else {
        map.setView([destino.gps_lat, destino.gps_lng], 14);
      }
    })();
    return () => { cancelado = true; };
  }, [destino.gps_lat, destino.gps_lng, destino.nombre, yo]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  const km = yo ? distanciaKm(yo.lat, yo.lng, destino.gps_lat, destino.gps_lng) : null;

  return (
    <div className="flex flex-col gap-2">
      <div role="application" aria-label={`Ruta hasta ${destino.nombre}`} className="relative z-0 isolate rounded-xl overflow-hidden border aspect-[16/10]">
        <div ref={elRef} className="w-full h-full" />
      </div>
      <p className="text-xs text-muted-foreground">
        {estado === "pidiendo" && "Buscando tu ubicación para trazar la ruta…"}
        {estado === "ok" && km != null && `Estás a ~${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} en línea recta. Usa “Cómo llegar” para la ruta por calle.`}
        {estado === "denegado" && "No pudimos obtener tu ubicación. Aún puedes abrir la ruta en Google Maps con “Cómo llegar”."}
      </p>
    </div>
  );
}

export default MapaRuta;
