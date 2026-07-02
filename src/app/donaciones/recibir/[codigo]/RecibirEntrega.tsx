"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { confirmarRecepcion, rechazarEntrega } from "@/app/actions/entregas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { EntregaPublica } from "@/app/actions/entregas";

// Personal del hospital confirma la recepción: foto (obligatoria), cantidad, lugar, nota + GPS.
export default function RecibirEntrega({ codigo, d }: { codigo: string; d: EntregaPublica }) {
  const router = useRouter();
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(String(d.cantidad ?? ""));
  const [lugar, setLugar] = useState(d.refugio?.nombre ?? d.hospital?.nombre ?? "");
  const [nota, setNota] = useState("");
  const [lote, setLote] = useState("");
  const [seriales, setSeriales] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 8000 },
    );
  }, []);

  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFoto(f);
    setPreview(URL.createObjectURL(f));
  }

  async function confirmar() {
    if (!foto) { toast.error("Toma una foto de la recepción (requisito de trazabilidad)."); return; }
    // Aviso (no bloqueo) si confirmas lejos del hospital destino: anti-fraude, empareja el tag post-registro.
    const h = d.hospital;
    if (gps && h?.gps_lat != null && h?.gps_lng != null) {
      const rad = (x: number) => (x * Math.PI) / 180;
      const dLat = rad(h.gps_lat - gps.lat), dLng = rad(h.gps_lng - gps.lng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(gps.lat)) * Math.cos(rad(h.gps_lat)) * Math.sin(dLng / 2) ** 2;
      const km = 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
      if (km > 5 && !confirm(`⚠️ Estás a ~${km.toFixed(0)} km de ${h.nombre ?? "el hospital"}. Confirmar la recepción desde aquí quedará marcado. ¿Continuar de todos modos?`)) return;
    }
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.set("codigo", codigo);
      fd.set("foto", foto);
      if (cantidad) fd.set("cantidad", cantidad);
      if (lugar) fd.set("lugar", lugar);
      if (nota) fd.set("nota", nota);
      if (lote) fd.set("lote", lote);
      if (seriales) fd.set("seriales", seriales);
      if (gps) { fd.set("gps_lat", String(gps.lat)); fd.set("gps_lng", String(gps.lng)); }
      const r = await confirmarRecepcion(fd);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("✅ Recepción confirmada. ¡Gracias!");
      router.push(`/donaciones/${codigo}`);
    } catch (e: any) {
      toast.error("No se pudo confirmar. Reintenta. " + (e?.message ?? ""));
    } finally {
      setGuardando(false);
    }
  }

  async function rechazar() {
    const motivo = window.prompt("¿Por qué no se recibió? (opcional)") ?? undefined;
    setRechazando(true);
    try {
      const r = await rechazarEntrega(codigo, motivo);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Marcada como no recibida.");
      router.push(`/donaciones/${codigo}`);
    } catch (e: any) {
      toast.error("No se pudo. Reintenta. " + (e?.message ?? ""));
    } finally {
      setRechazando(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link href={`/donaciones/${codigo}`} className="text-sm text-muted-foreground hover:underline">← Estado</Link>
        <h1 className="text-xl font-bold">Confirmar recepción</h1>
        <p className="text-sm text-muted-foreground">Donación <span className="font-mono">{codigo}</span></p>
      </header>

      <section className="rounded-xl border p-3 text-sm flex flex-col gap-1">
        {d.oferta && <p className="font-medium capitalize">{d.oferta.descripcion}{d.cantidad ? ` · ${d.cantidad}` : ""}</p>}
        {d.insumo?.nombre && <p className="text-muted-foreground">Para: {d.insumo.nombre}{d.area ? ` · ${d.area}` : ""}</p>}
        {d.oferta?.contacto_nombre && <p className="text-muted-foreground">Entrega: {d.oferta.contacto_nombre}</p>}
      </section>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold mb-1">Foto de la recepción *</p>
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden onChange={onFoto} />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Recepción" className="rounded-lg border w-full max-h-60 object-cover" onClick={() => fotoRef.current?.click()} />
          ) : (
            <button type="button" onClick={() => fotoRef.current?.click()} className="w-full rounded-xl border-2 border-dashed p-8 text-center text-sm text-muted-foreground hover:bg-muted">
              📷 Tomar foto de lo recibido
            </button>
          )}
          {preview && <button type="button" onClick={() => fotoRef.current?.click()} className="text-xs text-primary underline mt-1">Cambiar foto</button>}
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">Cantidad recibida
          <Input type="number" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Ej: 20" className="h-11 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Lugar de entrega
          <Input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Área / depósito / recepción" className="h-11 text-base" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">Lote <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            <Input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="N° de lote" className="h-11 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Seriales <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            <Input value={seriales} onChange={(e) => setSeriales(e.target.value)} placeholder="Seriales / códigos" className="h-11 text-base" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">Nota <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Observaciones de la recepción" className="border rounded-lg p-2 text-base bg-background" />
        </label>
        <p className="text-xs text-muted-foreground">{gps ? "📍 Ubicación capturada para la trazabilidad." : "Activa la ubicación para registrar el lugar exacto (opcional)."}</p>
      </div>

      <div className="flex flex-col gap-2 sticky bottom-0 bg-background pt-2 pb-1">
        <Button size="lg" onClick={confirmar} disabled={guardando || !foto}>{guardando ? "Confirmando…" : "✅ Confirmar que lo recibí"}</Button>
        <Button size="lg" variant="outline" onClick={rechazar} disabled={rechazando}>{rechazando ? "…" : "No se recibió"}</Button>
      </div>
    </main>
  );
}
