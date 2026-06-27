import { get, set } from "idb-keyval";

const KEY = "avihelp-cola";

type Pendiente = {
  id: string;
  blob: Blob;
  nombre: string;
  type: string;
  gps_lat?: number;
  gps_lng?: number;
};

async function leer(): Promise<Pendiente[]> {
  return (await get(KEY)) ?? [];
}

// Guarda una captura para enviarla cuando vuelva la conexión.
export async function encolar(file: File, gps?: { lat: number; lng: number }) {
  const cola = await leer();
  cola.push({
    id: crypto.randomUUID(),
    blob: file,
    nombre: file.name || "captura.jpg",
    type: file.type || "image/jpeg",
    gps_lat: gps?.lat,
    gps_lng: gps?.lng,
  });
  await set(KEY, cola);
}

export async function contarPendientes(): Promise<number> {
  return (await leer()).length;
}

// Reintenta enviar todo lo encolado. Devuelve cuántos se sincronizaron.
export async function sincronizar(): Promise<number> {
  let cola = await leer();
  if (!cola.length || !navigator.onLine) return 0;
  let ok = 0;
  for (const p of [...cola]) {
    try {
      const fd = new FormData();
      fd.append("imagen", new File([p.blob], p.nombre, { type: p.type }));
      if (p.gps_lat != null) fd.append("gps_lat", String(p.gps_lat));
      if (p.gps_lng != null) fd.append("gps_lng", String(p.gps_lng));
      const res = await fetch("/api/procesar", { method: "POST", body: fd });
      if (res.ok) {
        ok++;
        cola = cola.filter((x) => x.id !== p.id);
        await set(KEY, cola);
      }
    } catch {
      break; // sin conexión, reintentar luego
    }
  }
  return ok;
}
