"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { sincronizar } from "@/lib/offline";

// Registra el service worker y sincroniza la cola offline al cargar y al recuperar conexión.
export function PWA() {
  useEffect(() => {
    // Limpia cachés viejos de inmediato (auto-cura tras el bug de RSC cacheado).
    if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => k !== "avihelp-v3" && caches.delete(k))).catch(() => {});
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      // Cuando el SW nuevo toma control, recarga una vez para servir el bundle fresco.
      let recargando = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (recargando) return;
        recargando = true;
        location.reload();
      });
    }
    const flush = async () => {
      const n = await sincronizar();
      if (n > 0) toast.success(`${n} captura(s) sincronizada(s)`);
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  return null;
}
