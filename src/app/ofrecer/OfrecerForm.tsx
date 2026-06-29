"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { crearOferta, crearOfertasMixtas, extraerDonacion, type ItemDonacion, type MatchSugerido } from "@/app/actions/ofertas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Brand";

const TIPOS = [
  { v: "insumo_fisico", l: "📦 Tengo insumos para donar", ph: "Ej: 50 férulas, 20 cajas de guantes M, 10 L de solución salina" },
  { v: "personal_humano", l: "🩺 Soy personal y estoy disponible", ph: "Ej: Médico cirujano, disponible toda la semana en Caracas" },
] as const;

export type Centro = { id: string; nombre: string; ubicacion: string | null; gps_lat: number | null; gps_lng: number | null };

// Distancia aproximada (km) entre dos coords — para ordenar centros por cercanía.
function distKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Identidad: si el usuario está autenticado NO pedimos nombre/teléfono (ya sabemos
// quién es; el servidor autocompleta desde su perfil). Solo el visitante anónimo los deja.
// Toda oferta se entrega en un centro/refugio (obligatorio) — se ordena por cercanía si hay GPS.
export default function OfrecerForm({ autenticado, nombre, centros }: { autenticado: boolean; nombre: string | null; centros: Centro[] }) {
  const [tipo, setTipo] = useState<"insumo_fisico" | "personal_humano">("insumo_fisico");
  const [f, setF] = useState<Record<string, any>>({});
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState<{ sugerencias: number; creadas?: number; matches?: MatchSugerido[] } | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [ubicando, setUbicando] = useState(false);
  // Donación MIXTA: la IA puede extraer varios productos. Si hay items, se crea una oferta por cada uno.
  const [items, setItems] = useState<ItemDonacion[]>([]);
  const [extrayendo, setExtrayendo] = useState(false);
  const [aiTexto, setAiTexto] = useState("");
  const imgRef = useRef<HTMLInputElement>(null);
  const audRef = useRef<HTMLInputElement>(null);

  async function extraer(fd: FormData) {
    setExtrayendo(true);
    const r = await extraerDonacion(fd);
    setExtrayendo(false);
    if (!r.ok) { toast.error(r.error); return; }
    setItems(r.items);
    setTipo("insumo_fisico");
    toast.success(`Detectamos ${r.items.length} producto(s). Revísalos antes de enviar.`);
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>, campo: "imagen" | "audio") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.set(campo, file); extraer(fd);
    e.target.value = "";
  };
  const setItem = (idx: number, patch: Partial<ItemDonacion>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const quitarItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Ordena por cercanía si tenemos posición del navegador; si no, por nombre.
  const centrosOrden = useMemo(() => {
    if (!pos) return centros;
    return [...centros].sort((a, b) => {
      const da = a.gps_lat != null && a.gps_lng != null ? distKm(pos.lat, pos.lng, a.gps_lat, a.gps_lng) : Infinity;
      const db = b.gps_lat != null && b.gps_lng != null ? distKm(pos.lat, pos.lng, b.gps_lat, b.gps_lng) : Infinity;
      return da - db;
    });
  }, [centros, pos]);

  function ubicarme() {
    if (!navigator.geolocation) { toast.error("Tu navegador no permite ubicación."); return; }
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        setPos({ lat, lng });
        // Preselecciona el más cercano con coords.
        const cerca = [...centros].filter((c) => c.gps_lat != null && c.gps_lng != null)
          .sort((a, b) => distKm(lat, lng, a.gps_lat!, a.gps_lng!) - distKm(lat, lng, b.gps_lat!, b.gps_lng!))[0];
        if (cerca) setF((s) => ({ ...s, refugio_id: cerca.id }));
        setUbicando(false);
      },
      () => { toast.error("No pudimos obtener tu ubicación."); setUbicando(false); },
      { timeout: 8000 },
    );
  }

  const hayItems = items.length > 0;

  async function enviar() {
    setEnviando(true);
    const r = hayItems
      ? await crearOfertasMixtas(items, {
          refugio_id: f.refugio_id, ubicacion_actual: f.ubicacion_actual,
          contacto_nombre: f.contacto_nombre, contacto_telefono: f.contacto_telefono,
        })
      : await crearOferta({ ...f, tipo, cantidad: f.cantidad ? Number(f.cantidad) : null });
    setEnviando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    setOk({ sugerencias: (r as any).sugerencias ?? 0, creadas: (r as any).creadas, matches: (r as any).matches ?? [] });
  }

  const ph = TIPOS.find((t) => t.v === tipo)!.ph;
  // Validación: anónimo necesita teléfono; centro siempre; y descripción (salvo donación mixta por IA).
  const faltaTelefono = !autenticado && !f.contacto_telefono?.trim();
  const faltaCentro = !f.refugio_id;
  const faltaContenido = !hayItems && !f.descripcion?.trim();

  if (ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center flex flex-col items-center gap-3 rounded-2xl border p-6">
          <Logo size={56} />
          <h1 className="text-xl font-bold">¡Gracias! 💜</h1>
          <p className="text-sm text-muted-foreground">
            Registramos {ok.creadas && ok.creadas > 1 ? `tus ${ok.creadas} donaciones` : "tu oferta"}. Un coordinador la revisará y te contactará{autenticado ? "" : " al teléfono que dejaste"}.
          </p>
          {ok.matches && ok.matches.length > 0 && (
            <div className="w-full text-left rounded-xl border bg-primary/5 p-3 flex flex-col gap-2">
              <p className="text-sm font-semibold">🤖 Avi sugiere dónde hace más falta:</p>
              {ok.matches.slice(0, 6).map((m, i) => (
                <p key={i} className="text-sm">
                  {m.producto && <span className="font-medium capitalize">{m.producto}</span>}
                  {m.hospital && <> → <span className="font-medium">{m.hospital}</span></>}
                  {m.area && <span className="text-primary"> · área {m.area}</span>}
                  {m.razon && <span className="text-muted-foreground block text-xs">{m.razon}</span>}
                </p>
              ))}
              <p className="text-xs text-muted-foreground">Un coordinador confirmará el destino final.</p>
            </div>
          )}
          {autenticado && <Link href="/mis-donaciones" className="text-sm text-primary underline">Ver mis donaciones</Link>}
          <Link href="/ofrecer"><Button variant="outline" onClick={() => { setOk(null); setF({}); setItems([]); setAiTexto(""); }}>Registrar otra oferta</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-md mx-auto w-full flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <Logo size={56} />
        <h1 className="text-2xl font-bold">Ofrecer ayuda</h1>
        <p className="text-sm text-muted-foreground">¿Tienes insumos o eres personal de salud disponible? Déjanos saber y te conectamos donde más se necesita.</p>
      </header>

      {autenticado && (
        <p className="text-sm rounded-lg bg-primary/5 border px-3 py-2">
          Registras como <span className="font-semibold">{nombre || "tu cuenta"}</span>. Usaremos los datos de tu perfil para contactarte.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2">
        {TIPOS.map((t) => (
          <button key={t.v} onClick={() => setTipo(t.v)}
            className={`rounded-xl border p-3 text-left text-sm font-medium transition ${tipo === t.v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tipo === "insumo_fisico" && (
        <div className="rounded-xl border bg-muted/30 p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold">✨ Crea con IA: foto, audio o texto</p>
          <p className="text-xs text-muted-foreground">Sube una foto de tu lista/insumos, graba una nota de voz o pega un texto. Avi extrae los productos y cantidades (admite varios a la vez).</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" disabled={extrayendo} onClick={() => imgRef.current?.click()}>📷 Foto</Button>
            <Button type="button" variant="outline" size="sm" disabled={extrayendo} onClick={() => audRef.current?.click()}>🎙️ Audio</Button>
          </div>
          <input ref={imgRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e, "imagen")} />
          <input ref={audRef} type="file" accept="audio/*" capture hidden onChange={(e) => onFile(e, "audio")} />
          <div className="flex flex-col gap-2">
            <textarea value={aiTexto} onChange={(e) => setAiTexto(e.target.value)} rows={2}
              placeholder="…o escribe: 30 férulas, 20 cajas de guantes M, 10 L de solución salina"
              className="border rounded-lg p-2 text-base bg-background min-w-0" />
            <Button type="button" variant="outline" size="sm" disabled={extrayendo || !aiTexto.trim()}
              onClick={() => { const fd = new FormData(); fd.set("texto", aiTexto); extraer(fd); }}>
              {extrayendo ? "Analizando…" : "Extraer productos del texto"}
            </Button>
          </div>
        </div>
      )}

      {hayItems ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Productos a donar <span className="text-xs font-normal text-muted-foreground">(edita o quita los que no apliquen)</span></p>
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={it.nombre} onChange={(e) => setItem(i, { nombre: e.target.value })} className="h-11 text-base flex-1" placeholder="Producto" />
              <Input type="number" inputMode="numeric" value={it.cantidad ?? ""} onChange={(e) => setItem(i, { cantidad: e.target.value ? Number(e.target.value) : null })} className="h-11 text-base w-20" placeholder="Cant." />
              <button type="button" onClick={() => quitarItem(i)} aria-label="Quitar" className="shrink-0 size-9 rounded-lg border hover:bg-muted">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setItems([])} className="text-xs text-muted-foreground underline self-start">Limpiar lista y escribir a mano</button>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">¿Qué ofreces?
            <textarea value={f.descripcion ?? ""} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={3}
              placeholder={ph} className="border rounded-lg p-2 text-base bg-background min-w-0" />
          </label>

          {tipo === "insumo_fisico" && (
            <label className="flex flex-col gap-1 text-sm font-medium">Cantidad (aprox.)
              <Input type="number" inputMode="numeric" value={f.cantidad ?? ""} onChange={(e) => setF({ ...f, cantidad: e.target.value })} placeholder="50" className="h-11 text-base" />
            </label>
          )}
        </>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">¿Dónde estás?
        <Input value={f.ubicacion_actual ?? ""} onChange={(e) => setF({ ...f, ubicacion_actual: e.target.value })} placeholder="Ciudad / zona" className="h-11 text-base" />
      </label>

      <div className="flex flex-col gap-1 text-sm font-medium">
        <div className="flex items-center justify-between gap-2">
          <span>¿Dónde la entregas? *</span>
          <button type="button" onClick={ubicarme} disabled={ubicando}
            className="text-xs font-normal text-primary underline disabled:opacity-50">
            {ubicando ? "Ubicando…" : "📍 Usar mi ubicación"}
          </button>
        </div>
        <select value={f.refugio_id ?? ""} onChange={(e) => setF({ ...f, refugio_id: e.target.value || undefined })}
          className="h-11 text-base border rounded-lg px-2 bg-background min-w-0">
          <option value="">Elige un centro de acopio o refugio…</option>
          {centrosOrden.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}{c.ubicacion ? ` — ${c.ubicacion}` : ""}</option>
          ))}
        </select>
        {pos && <span className="text-xs font-normal text-muted-foreground">Ordenados del más cercano a ti.</span>}
      </div>

      {!autenticado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">Tu nombre
            <Input value={f.contacto_nombre ?? ""} onChange={(e) => setF({ ...f, contacto_nombre: e.target.value })} className="h-11 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Teléfono *
            <Input type="tel" value={f.contacto_telefono ?? ""} onChange={(e) => setF({ ...f, contacto_telefono: e.target.value })} placeholder="0414…" className="h-11 text-base" />
          </label>
        </div>
      )}

      <Button size="lg" onClick={enviar} disabled={enviando || faltaContenido || faltaTelefono || faltaCentro}>
        {enviando ? "Enviando…" : hayItems ? `Enviar ${items.length} producto(s)` : "Enviar oferta"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">AviHelp no procesa pagos ni almacena bienes: solo conecta tu oferta con quien la necesita.</p>
    </main>
  );
}
