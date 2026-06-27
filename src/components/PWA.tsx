"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { sincronizar } from "@/lib/offline";

// Registra el service worker y sincroniza la cola offline al cargar y al recuperar conexión.
export function PWA() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
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
