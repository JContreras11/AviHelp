"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { sincronizar } from "@/lib/offline";

// Registra el service worker y sincroniza la cola offline al cargar y al recuperar conexión.
export function PWA() {
  useEffect(() => {
    // Ya NO registramos service worker (causaba pantallas con bundle viejo).
    // Auto-cura: borra cachés y desregistra cualquier SW previo. El /sw.js
    // kill-switch hace lo mismo para quien lo tenga controlando.
    if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
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
