"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  crearOferta, crearOfertasMixtas, extraerDonacion, necesidadesParaItems,
  type ItemDonacion, type MatchSugerido, type NecesidadOpcion,
} from "@/app/actions/ofertas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Logo } from "@/components/Brand";

const MapaRefugios = dynamic(() => import("@/components/refugios/MapaRefugios").then((m) => m.MapaRefugios), {
  ssr: false,
  loading: () => <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">Cargando mapa…</div>,
});

export type Centro = { id: string; nombre: string; ubicacion: string | null; gps_lat: number | null; gps_lng: number | null };

function distKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Presentaciones farmacéuticas frecuentes (intake inteligente — modelo médico).
const PRESENTACIONES = ["caja", "frasco", "ampolla", "vial", "tableta", "comprimido", "jarabe", "solución", "sobre", "bolsa", "par", "unidad", "otro"];

type Paso = "tipo" | "captura" | "personal" | "items" | "ubicacion" | "entrega" | "contacto" | "enviar";

export default function DonacionWizard({ autenticado, nombre, centros }: { autenticado: boolean; nombre: string | null; centros: Centro[] }) {
  const [tipo, setTipo] = useState<"insumo_fisico" | "personal_humano" | null>(null);
  const [items, setItems] = useState<ItemDonacion[]>([]);
  const [neces, setNeces] = useState<Record<number, NecesidadOpcion[]>>({});
  const [descripcion, setDescripcion] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [ubicacionTexto, setUbicacionTexto] = useState("");
  const [ubicando, setUbicando] = useState(false);
  const [refugioId, setRefugioId] = useState<string | null>(null);
  const [contacto, setContacto] = useState({ nombre: "", telefono: "" });
  const [extrayendo, setExtrayendo] = useState(false);
  const [aiTexto, setAiTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState<{ codigos: string[]; matches: MatchSugerido[] } | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const audRef = useRef<HTMLInputElement>(null);

  // Pasos según el tipo. Mantiene UNA decisión por vista (mobile-first).
  const pasos: Paso[] = useMemo(() => {
    if (tipo === "personal_humano") return ["tipo", "personal", "ubicacion", "entrega", "contacto", "enviar"];
    return ["tipo", "captura", "items", "ubicacion", "entrega", "contacto", "enviar"];
  }, [tipo]);
  const [idx, setIdx] = useState(0);
  const paso = pasos[Math.min(idx, pasos.length - 1)];

  // Centros recomendados = los ligados a los hospitales de las necesidades relacionadas.
  const hospitalesRelacionados = useMemo(() => {
    const ids = new Set<string>();
    items.forEach((it, i) => {
      const sel = (neces[i] ?? []).find((n) => n.insumo_id === it.insumo_id);
      if (sel?.hospital_id) ids.add(sel.hospital_id);
    });
    return ids;
  }, [items, neces]);

  const centrosOrden = useMemo(() => {
    const arr = [...centros];
    if (pos) arr.sort((a, b) => {
      const da = a.gps_lat != null && a.gps_lng != null ? distKm(pos.lat, pos.lng, a.gps_lat, a.gps_lng) : Infinity;
      const db = b.gps_lat != null && b.gps_lng != null ? distKm(pos.lat, pos.lng, b.gps_lat, b.gps_lng) : Infinity;
      return da - db;
    });
    return arr;
  }, [centros, pos]);

  // Sugerencias de necesidades cuando cambian los nombres de los productos.
  useEffect(() => {
    if (paso !== "items" || !items.length) return;
    const nombres = items.map((i) => i.nombre);
    necesidadesParaItems(nombres).then(setNeces).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, items.map((i) => i.nombre).join("|")]);

  async function extraer(fd: FormData) {
    setExtrayendo(true);
    const r = await extraerDonacion(fd);
    setExtrayendo(false);
    if (!r.ok) { toast.error(r.error); return; }
    setItems(r.items);
    toast.success(`Detectamos ${r.items.length} producto(s). Revísalos.`);
    setIdx(pasos.indexOf("items"));
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>, campo: "imagen" | "audio") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.set(campo, file); extraer(fd);
    e.target.value = "";
  };
  const setItem = (i: number, patch: Partial<ItemDonacion>) => setItems((p) => p.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const quitarItem = (i: number) => setItems((p) => p.filter((_, k) => k !== i));

  function ubicarme() {
    if (!navigator.geolocation) { toast.error("Tu navegador no permite ubicación."); return; }
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        setPos({ lat, lng });
        const cerca = [...centros].filter((c) => c.gps_lat != null && c.gps_lng != null)
          .sort((a, b) => distKm(lat, lng, a.gps_lat!, a.gps_lng!) - distKm(lat, lng, b.gps_lat!, b.gps_lng!))[0];
        if (cerca && !refugioId) setRefugioId(cerca.id);
        setUbicando(false);
        toast.success("Ubicación lista. Ordenamos los centros por cercanía.");
      },
      () => { toast.error("No pudimos obtener tu ubicación. Escríbela abajo."); setUbicando(false); },
      { timeout: 8000 },
    );
  }

  async function enviar() {
    setEnviando(true);
    const base = {
      refugio_id: refugioId!, ubicacion_actual: ubicacionTexto || undefined,
      contacto_nombre: contacto.nombre || undefined, contacto_telefono: contacto.telefono || undefined,
    };
    const r = tipo === "insumo_fisico" && items.length
      ? await crearOfertasMixtas(items, base)
      : await crearOferta({
          tipo, descripcion, refugio_id: refugioId, ubicacion_actual: ubicacionTexto || null,
          contacto_nombre: contacto.nombre || null, contacto_telefono: contacto.telefono || null,
        });
    setEnviando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    const codigos: string[] = (r as any).codigos ?? ((r as any).codigo ? [(r as any).codigo] : []);
    setOk({ codigos, matches: (r as any).matches ?? [] });
  }

  // ── Validación por paso (habilita "Siguiente") ──
  const puedeSeguir = (() => {
    switch (paso) {
      case "tipo": return !!tipo;
      case "captura": return items.length > 0;
      case "personal": return descripcion.trim().length > 3;
      case "items": return items.length > 0 && items.every((i) => i.nombre.trim());
      case "ubicacion": return true; // opcional, ayuda a ordenar
      case "entrega": return !!refugioId;
      case "contacto": return autenticado || contacto.telefono.trim().length >= 6;
      default: return true;
    }
  })();

  const avanzar = () => setIdx((i) => Math.min(i + 1, pasos.length - 1));
  const retroceder = () => setIdx((i) => Math.max(i - 1, 0));

  if (ok) return <Exito ok={ok} autenticado={autenticado} onOtra={() => { setOk(null); setTipo(null); setItems([]); setNeces({}); setDescripcion(""); setRefugioId(null); setAiTexto(""); setIdx(0); }} />;

  const pasoNum = idx + 1, total = pasos.length;

  return (
    <main className="min-h-screen px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-4">
      <header className="flex flex-col items-center gap-1 text-center">
        <Logo size={44} />
        <h1 className="text-xl font-bold">Donar</h1>
        {/* Progreso */}
        <div className="w-full mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${(pasoNum / total) * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">Paso {pasoNum} de {total}</p>
      </header>

      {autenticado && paso === "tipo" && (
        <p className="text-sm rounded-lg bg-primary/5 border px-3 py-2">
          Donas como <span className="font-semibold">{nombre || "tu cuenta"}</span>. Usaremos tu perfil para contactarte.
        </p>
      )}

      <section className="flex-1 flex flex-col gap-3">
        {paso === "tipo" && (
          <div className="grid grid-cols-1 gap-3">
            <p className="text-base font-semibold">¿Qué quieres donar?</p>
            <PasoBtn activo={tipo === "insumo_fisico"} onClick={() => { setTipo("insumo_fisico"); }} emoji="📦" titulo="Insumos para donar" sub="Medicamentos, material médico, alimentos, ropa…" />
            <PasoBtn activo={tipo === "personal_humano"} onClick={() => { setTipo("personal_humano"); }} emoji="🩺" titulo="Soy personal de salud" sub="Médico, enfermería, paramédico disponible" />
          </div>
        )}

        {paso === "captura" && (
          <div className="flex flex-col gap-3">
            <p className="text-base font-semibold">✨ Cuéntale a Avi qué donas</p>
            <p className="text-sm text-muted-foreground">Sube una foto de tu lista/insumos, graba una nota de voz o escríbelo. Avi extrae los productos y cantidades.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" disabled={extrayendo} onClick={() => imgRef.current?.click()}>📷 Foto</Button>
              <Button type="button" variant="outline" disabled={extrayendo} onClick={() => audRef.current?.click()}>🎙️ Audio</Button>
            </div>
            <input ref={imgRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e, "imagen")} />
            <input ref={audRef} type="file" accept="audio/*" capture hidden onChange={(e) => onFile(e, "audio")} />
            <textarea value={aiTexto} onChange={(e) => setAiTexto(e.target.value)} rows={3}
              placeholder="…o escribe: 30 férulas, 20 cajas de guantes M, 10 L de solución salina"
              className="border rounded-lg p-3 text-base bg-background min-w-0" />
            <Button type="button" variant="outline" disabled={extrayendo || !aiTexto.trim()}
              onClick={() => { const fd = new FormData(); fd.set("texto", aiTexto); extraer(fd); }}>
              {extrayendo ? "Analizando…" : "Analizar lo que escribí"}
            </Button>
            {extrayendo && <p className="text-center text-sm text-muted-foreground animate-pulse">🤖 Avi está leyendo…</p>}
          </div>
        )}

        {paso === "personal" && (
          <label className="flex flex-col gap-1.5 text-base font-semibold">¿Cómo puedes ayudar?
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4}
              placeholder="Ej: Médico cirujano, disponible toda la semana en Caracas"
              className="border rounded-lg p-3 text-base font-normal bg-background min-w-0" />
          </label>
        )}

        {paso === "items" && (
          <div className="flex flex-col gap-3">
            <p className="text-base font-semibold">Revisa lo que donas</p>
            <p className="text-sm text-muted-foreground">Edita cantidad y presentación. Si Avi encontró un hospital que lo necesita, puedes relacionarlo — o déjalo libre y el equipo decide.</p>
            {items.map((it, i) => {
              const opciones = neces[i] ?? [];
              return (
                <div key={i} className="rounded-xl border p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input value={it.nombre} onChange={(e) => setItem(i, { nombre: e.target.value })} className="h-11 text-base flex-1" placeholder="Producto" />
                    <button type="button" onClick={() => quitarItem(i)} aria-label="Quitar" className="shrink-0 size-9 rounded-lg border hover:bg-muted">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">Cantidad
                      <Input type="number" inputMode="numeric" value={it.cantidad ?? ""} onChange={(e) => setItem(i, { cantidad: e.target.value ? Number(e.target.value) : null })} className="h-11 text-base" placeholder="Ej: 20" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">Presentación
                      <SearchableSelect
                        options={PRESENTACIONES.map((p) => ({ value: p, label: p }))}
                        value={it.presentacion ?? null} onChange={(v) => setItem(i, { presentacion: v })}
                        placeholder="frasco, caja…" allowCreate onCreate={(q) => setItem(i, { presentacion: q })}
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">Vencimiento <span className="opacity-70">(opcional, para perecederos)</span>
                    <Input type="date" value={it.vencimiento ?? ""} onChange={(e) => setItem(i, { vencimiento: e.target.value || null })} className="h-11 text-base" />
                  </label>
                  {/* MATCH: necesidades que encajan */}
                  {opciones.length > 0 ? (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-primary/5 border p-2">
                      <p className="text-xs font-semibold">🤖 ¿Para quién es? Esto lo necesita:</p>
                      <div className="flex flex-col gap-1">
                        {opciones.map((n) => {
                          const sel = it.insumo_id === n.insumo_id;
                          return (
                            <button key={n.insumo_id} type="button" onClick={() => setItem(i, { insumo_id: sel ? null : n.insumo_id })}
                              className={`text-left text-sm rounded-md px-2 py-1.5 border transition ${sel ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"}`}>
                              <span className="font-medium">{n.hospital ?? "Hospital"}</span>
                              {n.area && <span className="text-primary"> · {n.area}</span>}
                              {(n.prioridad === "critica" || n.prioridad === "alta") && <span className="ml-1 text-xs font-semibold text-red-600">{n.prioridad}</span>}
                              <span className="block text-xs text-muted-foreground">{n.nombre}{n.cantidad ? ` · faltan ${n.cantidad}${n.unidad ? " " + n.unidad : ""}` : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => setItem(i, { insumo_id: null })}
                        className={`text-xs self-start underline ${it.insumo_id ? "text-muted-foreground" : "text-primary font-medium"}`}>
                        Dejar libre (el equipo decide)
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin hospital sugerido aún — quedará libre para que el equipo lo asigne.</p>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={() => setItems((p) => [...p, { nombre: "", cantidad: null }])} className="text-sm text-primary underline self-start">+ Agregar producto a mano</button>
          </div>
        )}

        {paso === "ubicacion" && (
          <div className="flex flex-col gap-3">
            <p className="text-base font-semibold">¿Dónde estás?</p>
            <p className="text-sm text-muted-foreground">Nos ayuda a mostrarte los centros de entrega más cercanos.</p>
            <Button type="button" variant="outline" onClick={ubicarme} disabled={ubicando} className="w-full">
              {ubicando ? "Ubicando…" : pos ? "✅ Ubicación lista — actualizar" : "📍 Usar mi ubicación"}
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex-1 border-t" />o escríbela<span className="flex-1 border-t" /></div>
            <Input value={ubicacionTexto} onChange={(e) => setUbicacionTexto(e.target.value)} placeholder="Ciudad / zona (ej: Catia, Caracas)" className="h-11 text-base" />
          </div>
        )}

        {paso === "entrega" && (
          <div className="flex flex-col gap-3">
            <p className="text-base font-semibold">¿Dónde la entregas?</p>
            {hospitalesRelacionados.size > 0 && (
              <p className="text-xs rounded-lg bg-primary/5 border px-3 py-2">Relacionaste tu donación con {hospitalesRelacionados.size} hospital(es). Elige un centro de acopio o refugio cercano para dejarla.</p>
            )}
            <div className="h-56 rounded-xl border overflow-hidden">
              <MapaRefugios
                pins={centrosOrden.map((c) => ({ id: c.id, nombre: c.nombre, tipo: "refugio", ubicacion: c.ubicacion, gps_lat: c.gps_lat, gps_lng: c.gps_lng }))}
                sel={refugioId} onSelect={setRefugioId}
              />
            </div>
            <SearchableSelect
              options={centrosOrden.map((c) => ({ value: c.id, label: c.nombre + (c.ubicacion ? ` — ${c.ubicacion}` : ""), keywords: c.ubicacion ?? "" }))}
              value={refugioId} onChange={setRefugioId} placeholder="Elige un centro de acopio o refugio…"
            />
            {pos && <p className="text-xs text-muted-foreground">Ordenados del más cercano a ti. Toca un pin del mapa para elegirlo.</p>}
          </div>
        )}

        {paso === "contacto" && (
          autenticado ? (
            <div className="rounded-xl border bg-primary/5 p-4 text-sm">Te contactaremos con los datos de tu cuenta. ¡Listo para enviar!</div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-base font-semibold">¿Cómo te contactamos?</p>
              <label className="flex flex-col gap-1 text-sm font-medium">Tu nombre
                <Input value={contacto.nombre} onChange={(e) => setContacto({ ...contacto, nombre: e.target.value })} className="h-11 text-base" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Teléfono (WhatsApp) *
                <Input type="tel" value={contacto.telefono} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} placeholder="0414…" className="h-11 text-base" />
              </label>
            </div>
          )
        )}

        {paso === "enviar" && (
          <Resumen tipo={tipo!} items={items} descripcion={descripcion} centro={centros.find((c) => c.id === refugioId) ?? null} neces={neces} />
        )}
      </section>

      {/* Navegación */}
      <div className="flex gap-2 sticky bottom-0 bg-background pt-2 pb-1">
        {idx > 0 && <Button variant="outline" onClick={retroceder} className="flex-1">Atrás</Button>}
        {paso !== "enviar" ? (
          <Button onClick={avanzar} disabled={!puedeSeguir} className="flex-[2]">Siguiente</Button>
        ) : (
          <Button onClick={enviar} disabled={enviando || !refugioId} className="flex-[2]">{enviando ? "Enviando…" : "💜 Confirmar donación"}</Button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">AviHelp no procesa pagos ni almacena bienes: conecta tu donación con quien la necesita.</p>
    </main>
  );
}

function PasoBtn({ activo, onClick, emoji, titulo, sub }: { activo: boolean; onClick: () => void; emoji: string; titulo: string; sub: string }) {
  return (
    <button onClick={onClick} className={`rounded-xl border p-4 text-left flex items-start gap-3 transition ${activo ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}>
      <span className="text-2xl shrink-0">{emoji}</span>
      <span className="min-w-0"><span className="block font-semibold">{titulo}</span><span className="block text-sm text-muted-foreground">{sub}</span></span>
    </button>
  );
}

function Resumen({ tipo, items, descripcion, centro, neces }: { tipo: string; items: ItemDonacion[]; descripcion: string; centro: Centro | null; neces: Record<number, NecesidadOpcion[]> }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-semibold">Confirma tu donación</p>
      {tipo === "insumo_fisico" ? (
        <div className="flex flex-col gap-2">
          {items.map((it, i) => {
            const sel = (neces[i] ?? []).find((n) => n.insumo_id === it.insumo_id);
            return (
              <div key={i} className="rounded-lg border p-2.5 text-sm">
                <span className="font-medium capitalize">{it.nombre}</span>
                {it.cantidad ? <span className="text-muted-foreground"> · {it.cantidad}{it.presentacion ? " " + it.presentacion : ""}</span> : null}
                {it.vencimiento && <span className="text-amber-600"> · vence {it.vencimiento}</span>}
                <span className="block text-xs text-muted-foreground">{sel ? `🏥 Para ${sel.hospital}${sel.area ? ` · ${sel.area}` : ""}` : "Libre — el equipo lo asignará"}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border p-2.5 text-sm">🩺 {descripcion}</div>
      )}
      {centro && <p className="text-sm rounded-lg bg-primary/5 border px-3 py-2">📦 Entrega en: <span className="font-medium">{centro.nombre}</span>{centro.ubicacion ? ` — ${centro.ubicacion}` : ""}</p>}
    </div>
  );
}

function Exito({ ok, autenticado, onOtra }: { ok: { codigos: string[]; matches: MatchSugerido[] }; autenticado: boolean; onOtra: () => void }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center flex flex-col items-center gap-3 rounded-2xl border p-6">
        <Logo size={56} />
        <h1 className="text-xl font-bold">¡Gracias! 💜</h1>
        <p className="text-sm text-muted-foreground">
          Registramos {ok.codigos.length > 1 ? `tus ${ok.codigos.length} donaciones` : "tu donación"}. Sigue su estado y compártela con este enlace:
        </p>
        {ok.codigos.length > 0 && (
          <div className="w-full flex flex-col gap-2">
            {ok.codigos.map((c) => (
              <Link key={c} href={`/donaciones/${c}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                <span className="font-mono font-semibold">{c}</span>
                <span className="text-primary">Ver estado →</span>
              </Link>
            ))}
          </div>
        )}
        {ok.matches.length > 0 && (
          <div className="w-full text-left rounded-xl border bg-primary/5 p-3 flex flex-col gap-1">
            <p className="text-sm font-semibold">🤖 Avi sugiere dónde hace más falta:</p>
            {ok.matches.slice(0, 5).map((m, i) => (
              <p key={i} className="text-sm">{m.producto && <span className="font-medium capitalize">{m.producto}</span>}{m.hospital && <> → <span className="font-medium">{m.hospital}</span></>}{m.area && <span className="text-primary"> · {m.area}</span>}</p>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 w-full mt-1">
          <Link href="/donaciones" className="text-sm text-primary underline">Ver mis donaciones</Link>
          <Button variant="outline" onClick={onOtra}>Donar algo más</Button>
        </div>
      </div>
    </main>
  );
}
