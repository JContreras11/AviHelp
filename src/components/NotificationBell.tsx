"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from "@/app/actions/notificaciones";
import { hace } from "@/lib/format";

type Notif = { id: string; mensaje: string; leida: boolean; fecha_creacion: string; necesidad_id?: string | null };

// Destino de una notificación: hoy todas las internas apuntan a una necesidad (insumo).
export const destinoNotif = (n: { necesidad_id?: string | null }) => (n.necesidad_id ? `/necesidad/${n.necesidad_id}` : null);

export function NotificationBell() {
  const [rows, setRows] = useState<Notif[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const cerrarRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function refrescar() {
    // La campana degrada en silencio si falla la red: nunca bloquea la app ni lanza unhandled rejection.
    try { const r = await listarNotificaciones(); setRows(r.rows as Notif[]); setNoLeidas(r.noLeidas); }
    catch { /* se reintenta en el proximo refresh / evento realtime */ }
  }

  useEffect(() => {
    refrescar();
    const supabase = createClient();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid || cancelado) return;
      // Realtime: alerta en el momento exacto en que la BD registra el envío.
      // TODOS los .on(...) van ANTES de subscribe() (supabase prohíbe agregar
      // callbacks postgres_changes después de suscribir).
      canal = supabase.channel("notificaciones-" + uid);
      canal.on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones", filter: `usuario_destino_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as Notif;
          toast.info(n.mensaje, { duration: 8000 });
          setRows((prev) => [n, ...prev]);
          setNoLeidas((c) => c + 1);
        });
      // Si el efecto se limpió mientras getUser resolvía (StrictMode/desmontaje), no suscribir.
      if (cancelado) { supabase.removeChannel(canal); canal = null; return; }
      canal.subscribe();
    });

    // Limpieza con el MISMO cliente (createClient() crea uno nuevo y removeChannel sería no-op).
    return () => {
      cancelado = true;
      if (canal) { supabase.removeChannel(canal); canal = null; }
    };
  }, []);

  // Cerrar el panel al hacer click fuera o con Escape (teclado/mobile).
  useEffect(() => {
    if (!abierto) return;
    const h = (e: MouseEvent) => { if (cerrarRef.current && !cerrarRef.current.contains(e.target as Node)) setAbierto(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", onKey); };
  }, [abierto]);

  async function abrirNotif(n: Notif) {
    if (!n.leida) {
      setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      setNoLeidas((c) => Math.max(0, c - 1));
      marcarLeida(n.id);
    }
    setAbierto(false);
    const url = destinoNotif(n);
    if (url) router.push(url);
  }
  async function todasLeidas() {
    setRows((prev) => prev.map((x) => ({ ...x, leida: true })));
    setNoLeidas(0);
    await marcarTodasLeidas();
  }

  return (
    <div className="relative" ref={cerrarRef}>
      <button onClick={() => setAbierto((v) => !v)} className="relative px-2.5 py-1.5 rounded-lg hover:bg-muted" title="Notificaciones"
        aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"} aria-expanded={abierto} aria-haspopup="menu">
        <Bell className="size-5" />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div role="menu" aria-label="Notificaciones" className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl border bg-card shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="font-semibold text-sm">Notificaciones</span>
            {noLeidas > 0 && <button onClick={todasLeidas} className="text-xs text-primary hover:underline">Marcar leídas</button>}
          </div>
          <div className="max-h-96 overflow-auto">
            {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground text-center">Sin notificaciones.</p>}
            {rows.map((n) => (
              <button key={n.id} onClick={() => abrirNotif(n)}
                className={`w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted/50 ${n.leida ? "" : "bg-primary/5"}`}>
                <p className="text-sm leading-snug">{!n.leida && <span className="text-red-600">● </span>}{n.mensaje}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{hace(n.fecha_creacion)}{destinoNotif(n) ? " · ver detalle →" : ""}</p>
              </button>
            ))}
          </div>
          <Link href="/notificaciones" onClick={() => setAbierto(false)}
            className="block border-t px-3 py-2 text-center text-sm font-medium text-primary hover:bg-muted/50">
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
