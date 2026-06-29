"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from "@/app/actions/notificaciones";
import { destinoNotif } from "@/components/NotificationBell";
import { fechaHora } from "@/lib/format";

type Notif = { id: string; mensaje: string; leida: boolean; fecha_creacion: string; necesidad_id?: string | null };

export function Notificaciones() {
  const router = useRouter();
  const [rows, setRows] = useState<Notif[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  async function recargar() {
    setCargando(true); setError(false);
    try { const r = await listarNotificaciones(100); setRows(r.rows as Notif[]); }
    catch { setError(true); }       // antes: fallo dejaba el spinner pegado + unhandled rejection
    finally { setCargando(false); }
  }
  useEffect(() => { recargar(); }, []);

  async function abrir(n: Notif) {
    if (!n.leida) { marcarLeida(n.id); setRows((p) => p.map((x) => x.id === n.id ? { ...x, leida: true } : x)); }
    const url = destinoNotif(n);
    if (url) router.push(url);
  }
  async function todas() {
    setRows((p) => p.map((x) => ({ ...x, leida: true })));
    await marcarTodasLeidas();
  }

  const noLeidas = rows.filter((r) => !r.leida).length;

  if (cargando) return <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Cargando…</p>;
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground" role="alert">
      <p>⚠️ No se pudieron cargar las notificaciones.</p>
      <Button variant="outline" size="sm" onClick={recargar}>Reintentar</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {noLeidas > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={todas}>Marcar todas leídas</Button>
        </div>
      )}
      <div className="rounded-xl border divide-y">
        {rows.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No tienes notificaciones.</p>}
        {rows.map((n) => {
          const nav = !!destinoNotif(n);
          return (
            <button key={n.id} onClick={() => abrir(n)} disabled={!nav && n.leida}
              className={`w-full text-left p-3 hover:bg-muted/50 transition ${n.leida ? "" : "bg-primary/5"} ${nav ? "" : "cursor-default"}`}>
              <p className="text-sm leading-snug">{!n.leida && <span className="text-red-600">● </span>}{n.mensaje}</p>
              <p className="text-xs text-muted-foreground mt-1">{fechaHora(n.fecha_creacion)}{nav ? " · ver detalle →" : ""}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
