"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  crearOferta, crearOfertasMixtas, extraerDonacion, necesidadesParaItems,
  type ItemDonacion, type MatchSugerido, type NecesidadOpcion,
} from "@/app/actions/ofertas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { HelpTip } from "@/components/ui/help-tip";
import { CompartirDonacion } from "@/components/donaciones/CompartirDonacion";
import { CopyableText } from "@/components/donaciones/CopyableText";
import { Logo } from "@/components/Brand";
import { PasswordModal } from "./PasswordModal";
import { MapaEntrega, type CentroPin } from "./MapaEntrega";
import { rubricaDonacion, emojiRubrica, nombreDonacion } from "../rubrica";

export type Centro = { id: string; nombre: string; ubicacion: string | null; gps_lat: number | null; gps_lng: number | null };

function distKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Presentaciones farmacéuticas frecuentes (intake inteligente — modelo médico).
const PRESENTACIONES = ["bombona", "caja", "frasco", "tableta", "cápsula", "comprimido", "vial", "ampolla", "polvo", "jarabe", "solución", "tubo", "bolsa", "sobre", "crema", "pomada", "inhalador", "parche", "blíster", "par", "unidad", "otro"];

// FIX 3: pasos de ubicación y entrega FUSIONADOS en uno solo ("entrega").
type Paso = "tipo" | "captura" | "personal" | "items" | "entrega" | "contacto" | "enviar";

export default function DonacionWizard({ autenticado, nombre, centros, hospitalCtx = null }: { autenticado: boolean; nombre: string | null; centros: Centro[]; hospitalCtx?: { id: string; nombre: string } | null }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"insumo_fisico" | "personal_humano" | null>(null);
  const [items, setItems] = useState<ItemDonacion[]>([]);
  const [neces, setNeces] = useState<Record<number, NecesidadOpcion[]>>({});
  const [descripcion, setDescripcion] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [ubicacionTexto, setUbicacionTexto] = useState("");
  const [ubicando, setUbicando] = useState(false);
  const [refugioIds, setRefugioIds] = useState<string[]>([]); // FIX 3/4: varios posibles, ≥1
  const [contacto, setContacto] = useState({ nombre: "", telefono: "", email: "", anonimo: false });
  const [extrayendo, setExtrayendo] = useState(false);
  const [aiTexto, setAiTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [yaAutenticado, setYaAutenticado] = useState(autenticado);
  const [pwOpen, setPwOpen] = useState(false);
  const [ok, setOk] = useState<{ codigos: string[]; matches: MatchSugerido[]; centro: Centro | null; centros: Centro[]; tipo: "insumo_fisico" | "personal_humano"; donante: string } | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const audRef = useRef<HTMLInputElement>(null);
  const imgRef2 = useRef<HTMLInputElement>(null);
  const audRef2 = useRef<HTMLInputElement>(null);

  const pasos: Paso[] = useMemo(() => {
    if (tipo === "personal_humano") return ["tipo", "personal", "entrega", "contacto", "enviar"];
    return ["tipo", "captura", "items", "entrega", "contacto", "enviar"];
  }, [tipo]);
  const [idx, setIdx] = useState(0);
  const paso = pasos[Math.min(idx, pasos.length - 1)];
  // FIX 5: voluntariado (personal de salud que se ofrece) usa lenguaje de PRESENTARSE,
  // no de entrega física. Ramificamos las etiquetas en todo el flujo.
  const esVol = tipo === "personal_humano";

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

  // Centro PRIMARIO de entrega = el seleccionado más cercano al usuario (o el primero).
  const centroPrimario = useMemo<Centro | null>(() => {
    const sel = centros.filter((c) => refugioIds.includes(c.id));
    if (!sel.length) return null;
    if (!pos) return sel[0];
    return [...sel].sort((a, b) => {
      const da = a.gps_lat != null && a.gps_lng != null ? distKm(pos.lat, pos.lng, a.gps_lat, a.gps_lng) : Infinity;
      const db = b.gps_lat != null && b.gps_lng != null ? distKm(pos.lat, pos.lng, b.gps_lat, b.gps_lng) : Infinity;
      return da - db;
    })[0];
  }, [centros, refugioIds, pos]);

  const pinsMapa: CentroPin[] = useMemo(() => centrosOrden.map((c) => ({ id: c.id, nombre: c.nombre, ubicacion: c.ubicacion, gps_lat: c.gps_lat, gps_lng: c.gps_lng })), [centrosOrden]);
  const routePin: CentroPin | null = centroPrimario ? { id: centroPrimario.id, nombre: centroPrimario.nombre, ubicacion: centroPrimario.ubicacion, gps_lat: centroPrimario.gps_lat, gps_lng: centroPrimario.gps_lng } : null;

  // Sugerencias de necesidades cuando cambian los nombres de los productos.
  useEffect(() => {
    if (paso !== "items" || !items.length) return;
    const nombres = items.map((i) => i.nombre);
    necesidadesParaItems(nombres).then((res) => {
      if (hospitalCtx) {
        for (const k of Object.keys(res)) {
          res[+k] = [...res[+k]].sort((a, b) => Number(b.hospital_id === hospitalCtx.id) - Number(a.hospital_id === hospitalCtx.id));
        }
      }
      setNeces(res);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, items.map((i) => i.nombre).join("|")]);

  async function extraer(fd: FormData, modo: "replace" | "append" = "replace") {
    setExtrayendo(true);
    const r = await extraerDonacion(fd);
    setExtrayendo(false);
    if (!r.ok) { toast.error(r.error); return; }
    if (modo === "append") {
      setItems((p) => [...p, ...r.items]);
      toast.success(`Agregamos ${r.items.length} producto(s) más.`);
    } else {
      setItems(r.items);
      toast.success(`Detectamos ${r.items.length} producto(s). Revísalos.`);
      setIdx(pasos.indexOf("items"));
    }
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>, campo: "imagen" | "audio", modo: "replace" | "append" = "replace") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.set(campo, file); extraer(fd, modo);
    e.target.value = "";
  };
  const setItem = (i: number, patch: Partial<ItemDonacion>) => setItems((p) => p.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const quitarItem = (i: number) => setItems((p) => p.filter((_, k) => k !== i));
  const toggleRefugio = (id: string) => setRefugioIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function ubicarme() {
    if (!navigator.geolocation) { toast.error("Tu navegador no permite ubicación."); return; }
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        setPos({ lat, lng });
        const cerca = [...centros].filter((c) => c.gps_lat != null && c.gps_lng != null)
          .sort((a, b) => distKm(lat, lng, a.gps_lat!, a.gps_lng!) - distKm(lat, lng, b.gps_lat!, b.gps_lng!))[0];
        if (cerca && refugioIds.length === 0) setRefugioIds([cerca.id]);
        setUbicando(false);
        toast.success("Ubicación lista. Te recomendamos el centro más cercano.");
      },
      () => { toast.error("No pudimos obtener tu ubicación. Escríbela abajo."); setUbicando(false); },
      { timeout: 8000 },
    );
  }

  async function enviar() {
    setEnviando(true);
    const base = {
      refugio_id: centroPrimario!.id, ubicacion_actual: ubicacionTexto || undefined,
      contacto_nombre: contacto.anonimo ? undefined : (contacto.nombre || undefined), contacto_telefono: contacto.telefono || undefined,
    };
    const r = tipo === "insumo_fisico" && items.length
      ? await crearOfertasMixtas(items, base)
      : await crearOferta({
          tipo, descripcion, refugio_id: centroPrimario!.id, ubicacion_actual: ubicacionTexto || null,
          contacto_nombre: contacto.anonimo ? null : (contacto.nombre || null), contacto_telefono: contacto.telefono || null,
        });
    setEnviando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    const codigos: string[] = (r as any).codigos ?? ((r as any).codigo ? [(r as any).codigo] : []);
    const seleccionados = centros.filter((c) => refugioIds.includes(c.id));
    const donanteNombre = contacto.anonimo ? "Anónimo" : (yaAutenticado ? (nombre ?? "") : contacto.nombre);
    setOk({ codigos, matches: (r as any).matches ?? [], centro: centroPrimario, centros: seleccionados, tipo: tipo!, donante: donanteNombre });
  }

  // FIX 2: si es anónimo y dejó email+teléfono, ofrece crear cuenta/entrar ANTES de registrar.
  function confirmar() {
    if (!centroPrimario) { toast.error("Elige al menos un centro de entrega."); return; }
    if (!yaAutenticado && contacto.email.trim() && contacto.telefono.trim()) { setPwOpen(true); return; }
    enviar();
  }

  const puedeSeguir = (() => {
    switch (paso) {
      case "tipo": return !!tipo;
      case "captura": return items.length > 0;
      case "personal": return descripcion.trim().length > 3;
      case "items": return items.length > 0 && items.every((i) => i.nombre.trim());
      case "entrega": return refugioIds.length >= 1; // FIX 3: ≥1 centro
      case "contacto": return yaAutenticado || contacto.anonimo || contacto.telefono.trim().length >= 6;
      default: return true;
    }
  })();

  const avanzar = () => setIdx((i) => Math.min(i + 1, pasos.length - 1));
  const retroceder = () => setIdx((i) => Math.max(i - 1, 0));

  if (ok) return <Exito ok={ok} onOtra={() => { setOk(null); setTipo(null); setItems([]); setNeces({}); setDescripcion(""); setRefugioIds([]); setAiTexto(""); setIdx(0); }} onIr={(c) => router.push(`/donaciones/${c}`)} />;

  const pasoNum = idx + 1, total = pasos.length;
  const rubricaActual = rubricaDonacion(tipo, [descripcion, ...items.map((i) => `${i.nombre} ${i.area ?? ""}`)].join(" "));

  return (
    <main className="min-h-screen px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-4 lg:max-w-2xl">
      <header className="flex flex-col items-center gap-1 text-center">
        <Logo size={44} />
        <h1 className="text-xl font-bold">Donar</h1>
        <div className="w-full mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${(pasoNum / total) * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">Paso {pasoNum} de {total}</p>
      </header>

      {hospitalCtx && paso === "tipo" && (
        <p className="text-sm rounded-lg bg-primary/5 border px-3 py-2">
          🏥 Estás ayudando a <span className="font-semibold">{hospitalCtx.nombre}</span>. Priorizaremos sus necesidades al relacionar tu donación.
        </p>
      )}
      {yaAutenticado && paso === "tipo" && (
        <p className="text-sm rounded-lg bg-primary/5 border px-3 py-2">
          Donas como <span className="font-semibold">{nombre || "tu cuenta"}</span>. Usaremos tu perfil para contactarte.
        </p>
      )}

      <section className="flex-1 flex flex-col gap-3">
        {paso === "tipo" && (
          <div className="grid grid-cols-1 gap-3">
            <p className="text-base font-semibold">¿Qué quieres donar? <HelpTip label="¿Qué puedo donar?">Elige insumos físicos (medicinas, material, comida, ropa) o, si eres personal de salud, ofrécete a ayudar.</HelpTip></p>
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
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>Cantidad <HelpTip label="¿Qué cantidad pongo?">Cuántas unidades donas de este producto (por ejemplo, 20).</HelpTip></span>
                      <Input type="number" inputMode="numeric" value={it.cantidad ?? ""} onChange={(e) => setItem(i, { cantidad: e.target.value ? Number(e.target.value) : null })} className="h-11 text-base" placeholder="Ej: 20" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>Presentación <HelpTip label="¿Qué es la presentación?">Cómo viene el producto: caja, frasco, ampolla, sobre… Elige una o escribe la tuya.</HelpTip></span>
                      <SearchableSelect
                        options={PRESENTACIONES.map((p) => ({ value: p, label: p }))}
                        value={it.presentacion ?? null} onChange={(v) => setItem(i, { presentacion: v })}
                        placeholder="frasco, caja…" allowCreate onCreate={(q) => setItem(i, { presentacion: q })}
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>Vencimiento <span className="opacity-70">(opcional, para perecederos)</span> <HelpTip label="¿Para qué el vencimiento?">Solo si el producto caduca (medicinas, comida). Ayuda a priorizar lo que vence pronto.</HelpTip></span>
                    <Input type="date" value={it.vencimiento ?? ""} onChange={(e) => setItem(i, { vencimiento: e.target.value || null })} className="h-11 text-base" />
                  </label>
                  {opciones.length > 0 ? (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-primary/5 border p-2">
                      <p className="text-xs font-semibold">🤖 ¿Para quién es? Esto lo necesita: <HelpTip label="¿Asignar o dejar libre?">Si eliges un hospital, tu donación queda reservada para él. «Dejar libre» permite que el equipo la asigne a donde más falte.</HelpTip></p>
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

        {/* FIX 3/4/5: paso ÚNICO de entrega/presentación — ubicación + mapa + recomendar cercano + elegir ≥1. */}
        {paso === "entrega" && (
          <div className="flex flex-col gap-3">
            <p className="text-base font-semibold">{esVol ? "¿Dónde vas a ayudar?" : "¿Dónde la entregas?"} <HelpTip label={esVol ? "¿Dónde ayudo?" : "¿Dónde entrego?"}>{esVol ? "Elige uno o varios centros o refugios donde puedes presentarte a ayudar. El más cercano a ti será el recomendado." : "Elige uno o varios centros de acopio o refugios donde dejar tu donación. El más cercano a ti será el recomendado."}</HelpTip></p>
            <p className="text-sm text-muted-foreground">{esVol ? "Usa tu ubicación para ver los centros más cercanos. Elige uno o varios donde harás voluntariado; el más cercano será tu punto recomendado." : "Usa tu ubicación para ver los centros más cercanos. Elige uno o varios; el más cercano será tu punto recomendado."}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={ubicarme} disabled={ubicando} className="flex-1">
                {ubicando ? "Ubicando…" : pos ? "✅ Ubicación lista — actualizar" : "📍 Usar mi ubicación"}
              </Button>
              <Input value={ubicacionTexto} onChange={(e) => setUbicacionTexto(e.target.value)} placeholder="o escribe tu zona (Catia, Caracas)" className="h-11 text-base flex-1" />
            </div>
            {centros.length === 0 && (
              <p className="text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">Aún no hay centros de acopio cargados. Registra tu donación con tu contacto y un coordinador te indicará dónde entregarla.</p>
            )}
            {hospitalesRelacionados.size > 0 && (
              <p className="text-xs rounded-lg bg-primary/5 border px-3 py-2">Relacionaste tu donación con {hospitalesRelacionados.size} hospital(es). Elige un centro de acopio o refugio cercano para dejarla.</p>
            )}
            <div className="relative z-0 isolate h-64 rounded-xl border overflow-hidden">
              <MapaEntrega centros={pinsMapa} userPos={pos} selectedIds={refugioIds} onToggle={toggleRefugio} routeTo={routePin} />
            </div>
            <SearchableSelect
              options={centrosOrden.filter((c) => !refugioIds.includes(c.id)).map((c) => ({ value: c.id, label: c.nombre + (c.ubicacion ? ` — ${c.ubicacion}` : ""), keywords: c.ubicacion ?? "" }))}
              value={null} onChange={(v) => v && toggleRefugio(v)} placeholder="Agregar un centro de acopio o refugio…"
            />
            {refugioIds.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Seleccionados ({refugioIds.length}):</p>
                {centros.filter((c) => refugioIds.includes(c.id)).map((c) => {
                  const km = pos && c.gps_lat != null && c.gps_lng != null ? distKm(pos.lat, pos.lng, c.gps_lat, c.gps_lng) : null;
                  const esPrimario = centroPrimario?.id === c.id;
                  return (
                    <div key={c.id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${esPrimario ? "border-primary bg-primary/5" : ""}`}>
                      <span className="min-w-0">
                        <span className="font-medium">📍 {c.nombre}</span>
                        {esPrimario && <span className="ml-1 text-xs text-primary font-semibold">recomendado</span>}
                        {km != null && <span className="block text-xs text-muted-foreground">a ~{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</span>}
                      </span>
                      <button type="button" onClick={() => toggleRefugio(c.id)} aria-label="Quitar" className="shrink-0 size-8 rounded-lg border hover:bg-muted">✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            {pos && centros.length > 0 && <p className="text-xs text-muted-foreground">Ordenados del más cercano a ti. Toca un pin del mapa para elegirlo o quitarlo.</p>}
          </div>
        )}

        {paso === "contacto" && (
          yaAutenticado ? (
            <div className="rounded-xl border bg-primary/5 p-4 text-sm">Te contactaremos con los datos de tu cuenta. ¡Listo para enviar!</div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-base font-semibold">¿Cómo te contactamos?</p>
              <label className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
                <input type="checkbox" checked={contacto.anonimo} onChange={(e) => setContacto({ ...contacto, anonimo: e.target.checked })} className="size-4" />
                Donar como <span className="font-semibold">anónimo</span> (no mostrar mi nombre)
              </label>
              {!contacto.anonimo && (
                <label className="flex flex-col gap-1 text-sm font-medium">Tu nombre
                  <Input value={contacto.nombre} onChange={(e) => setContacto({ ...contacto, nombre: e.target.value })} className="h-11 text-base" />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm font-medium">Teléfono (WhatsApp) *
                <Input type="tel" value={contacto.telefono} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} placeholder="0414…" className="h-11 text-base" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Correo <span className="text-xs font-normal text-muted-foreground">(para crear tu cuenta y seguir tus donaciones)</span>
                <Input type="email" value={contacto.email} onChange={(e) => setContacto({ ...contacto, email: e.target.value })} placeholder="tucorreo@ejemplo.com" className="h-11 text-base" />
              </label>
              <p className="text-xs text-muted-foreground">Si dejas tu correo, al confirmar te pediremos una contraseña para que tu donación quede a tu nombre.</p>
            </div>
          )
        )}

        {/* FIX 6/7: confirmación con el MISMO mapa + ruta + 3 recomendaciones + agregar más. */}
        {paso === "enviar" && (
          <Confirmacion
            tipo={tipo!} items={items} descripcion={descripcion} centro={centroPrimario} neces={neces}
            pins={pinsMapa} userPos={pos} routePin={routePin} refugioIds={refugioIds}
            rubrica={rubricaActual} donante={contacto.anonimo ? "Anónimo" : (yaAutenticado ? (nombre ?? "") : contacto.nombre)}
            extrayendo={extrayendo}
            onFoto={() => imgRef2.current?.click()} onAudio={() => audRef2.current?.click()}
            onTexto={(t) => { const fd = new FormData(); fd.set("texto", t); extraer(fd, "append"); }}
          />
        )}
        <input ref={imgRef2} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e, "imagen", "append")} />
        <input ref={audRef2} type="file" accept="audio/*" capture hidden onChange={(e) => onFile(e, "audio", "append")} />
      </section>

      <div className="flex gap-2 sticky bottom-0 bg-background pt-2 pb-1">
        {idx > 0 && <Button variant="outline" onClick={retroceder} className="flex-1">Atrás</Button>}
        {paso !== "enviar" ? (
          <Button onClick={avanzar} disabled={!puedeSeguir} className="flex-[2]">Siguiente</Button>
        ) : (
          <Button onClick={confirmar} disabled={enviando || !centroPrimario} className="flex-[2]">{enviando ? "Enviando…" : "💜 Confirmar donación"}</Button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">AviHelp no procesa pagos ni almacena bienes: conecta tu donación con quien la necesita.</p>

      {pwOpen && (
        <PasswordModal
          email={contacto.email.trim()} nombre={contacto.anonimo ? undefined : contacto.nombre} telefono={contacto.telefono}
          onAuthed={() => { setPwOpen(false); setYaAutenticado(true); enviar(); }}
          onSkip={() => { setPwOpen(false); enviar(); }}
          onClose={() => setPwOpen(false)}
        />
      )}
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

const RECOMENDACIONES = [
  { emoji: "🏷️", txt: "Clasifica por tipo (medicinas, material, comida) y rotúlalo." },
  { emoji: "✅", txt: "Lleva todo en buen estado y dentro de su empaque original." },
  { emoji: "🥫", txt: "La comida, mejor no perecedera y sin abrir." },
];

// FIX 5: recomendaciones para VOLUNTARIADO (personal de salud que se presenta a ayudar).
const RECOMENDACIONES_VOL = [
  { emoji: "🪪", txt: "Lleva tu identificación y, si tienes, tu credencial o título profesional." },
  { emoji: "🕑", txt: "Confirma el horario con el centro antes de ir y sé puntual." },
  { emoji: "📞", txt: "Guarda el contacto del lugar por si necesitas coordinar tu llegada." },
];

// FIX 6/7 — confirmación: mismo mapa + ruta (col 1) y resumen + recomendaciones + agregar más (col 2).
function Confirmacion({
  tipo, items, descripcion, centro, neces, pins, userPos, routePin, refugioIds, rubrica, donante, extrayendo, onFoto, onAudio, onTexto,
}: {
  tipo: string; items: ItemDonacion[]; descripcion: string; centro: Centro | null; neces: Record<number, NecesidadOpcion[]>;
  pins: CentroPin[]; userPos: { lat: number; lng: number } | null; routePin: CentroPin | null; refugioIds: string[];
  rubrica: ReturnType<typeof rubricaDonacion>; donante: string; extrayendo: boolean;
  onFoto: () => void; onAudio: () => void; onTexto: (t: string) => void;
}) {
  const [txt, setTxt] = useState("");
  const esVol = tipo === "personal_humano";
  // FIX 5/7: voluntario elige VARIOS lugares donde ayudar → muéstralos TODOS como activos.
  const seleccionados = pins.filter((p) => refugioIds.includes(p.id));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-semibold">{esVol ? "Confirma tu voluntariado" : "Confirma tu donación"}</p>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Columna mapa (desktop 6) */}
        <div className="lg:col-span-6 flex flex-col gap-2">
          {/* FIX 6: relative z-0 isolate contiene el z-index de leaflet (no tapa el modal). */}
          <div className="relative z-0 isolate h-56 rounded-xl border overflow-hidden">
            <MapaEntrega centros={pins} userPos={userPos} selectedIds={refugioIds} onToggle={() => {}} routeTo={routePin} />
          </div>
          {esVol ? (
            seleccionados.length > 0 && (
              <div className="text-sm rounded-lg bg-primary/5 border px-3 py-2">
                <p className="font-medium">🩺 {seleccionados.length > 1 ? "Centros donde harás voluntariado:" : "Preséntate en:"}</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {seleccionados.map((c) => (
                    <li key={c.id}>✅ <span className="font-medium">{c.nombre}</span>{c.ubicacion ? ` — ${c.ubicacion}` : ""}</li>
                  ))}
                </ul>
              </div>
            )
          ) : (
            centro && (
              <p className="text-sm rounded-lg bg-primary/5 border px-3 py-2">📦 Lleva tu donación a: <span className="font-medium">{centro.nombre}</span>{centro.ubicacion ? ` — ${centro.ubicacion}` : ""}{refugioIds.length > 1 ? ` (o cualquiera de los ${refugioIds.length} seleccionados)` : ""}</p>
            )
          )}
        </div>
        {/* Columna resumen + recomendaciones (desktop 6) */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <div className="rounded-lg border p-2.5 text-sm flex items-center gap-2">
            <span className="text-lg">{emojiRubrica(rubrica)}</span>
            <span><span className="font-medium">{nombreDonacion(donante)}</span><span className="block text-xs text-muted-foreground">{rubrica}</span></span>
          </div>
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

          <div className="rounded-xl border bg-primary/5 p-3 flex flex-col gap-1.5">
            <p className="text-sm font-semibold">{esVol ? "Antes de presentarte:" : "Cómo llevar tus cosas:"}</p>
            {(esVol ? RECOMENDACIONES_VOL : RECOMENDACIONES).map((r) => (
              <p key={r.txt} className="text-sm flex gap-2"><span>{r.emoji}</span><span className="text-muted-foreground">{r.txt}</span></p>
            ))}
          </div>

          {/* FIX 7 — agregar más ítems reusando la captura IA. */}
          {tipo === "insumo_fisico" && (
            <div className="rounded-xl border p-3 flex flex-col gap-2">
              <p className="text-sm font-semibold">¿Quieres agregar algo más?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" disabled={extrayendo} onClick={onFoto}>📷 Foto</Button>
                <Button type="button" variant="outline" size="sm" disabled={extrayendo} onClick={onAudio}>🎙️ Audio</Button>
              </div>
              <div className="flex gap-2">
                <Input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="…o escribe otro producto" className="h-10 text-sm flex-1" />
                <Button type="button" variant="outline" size="sm" disabled={extrayendo || !txt.trim()} onClick={() => { onTexto(txt); setTxt(""); }}>Agregar</Button>
              </div>
              {extrayendo && <p className="text-center text-xs text-muted-foreground animate-pulse">🤖 Avi está leyendo…</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// FIX 5/7 — pantalla de éxito GRANDE, centrada. Identifica por NOMBRE/tipo (no por el
// código, que queda como texto secundario copiable) y ramifica el lenguaje: donación
// física = "Lleva tus cosas a…"; voluntariado = "Preséntate en…". Muestra TODOS los
// centros seleccionados (el voluntario puede elegir varios).
function Exito({ ok, onOtra, onIr }: { ok: { codigos: string[]; matches: MatchSugerido[]; centro: Centro | null; centros: Centro[]; tipo: "insumo_fisico" | "personal_humano"; donante: string }; onOtra: () => void; onIr: (codigo: string) => void }) {
  const uno = ok.codigos.length === 1 ? ok.codigos[0] : null;
  const esVol = ok.tipo === "personal_humano";
  const lugares = ok.centros.length ? ok.centros : (ok.centro ? [ok.centro] : []);
  const rubrica = rubricaDonacion(ok.tipo);
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl text-center flex flex-col items-center gap-4">
        <Logo size={72} />
        <h1 className="text-3xl sm:text-4xl font-bold">¡Gracias! 💜</h1>
        <p className="text-base text-muted-foreground max-w-md">
          {esVol
            ? "Registramos tu ofrecimiento de voluntariado. Un coordinador te contactará."
            : `Registramos ${ok.codigos.length > 1 ? `tus ${ok.codigos.length} donaciones` : "tu donación"}.`}
        </p>
        {lugares.length > 0 && (
          <div className="w-full max-w-md rounded-2xl bg-primary/5 p-5">
            <p className="text-sm text-muted-foreground">{esVol ? (lugares.length > 1 ? "Preséntate en cualquiera de estos centros:" : "Preséntate en:") : "Lleva tus cosas a:"}</p>
            <div className="mt-2 flex flex-col gap-3">
              {lugares.map((c) => (
                <div key={c.id} className="flex flex-col items-center">
                  <p className="text-lg font-bold">{esVol ? "🩺" : "📦"} {c.nombre}</p>
                  {c.ubicacion && <p className="text-sm text-muted-foreground mt-0.5">📍 {c.ubicacion}</p>}
                  {c.gps_lat != null && c.gps_lng != null && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${c.gps_lat},${c.gps_lng}`} target="_blank" rel="noreferrer"
                      className="inline-block mt-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">🧭 Cómo llegar</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {ok.codigos.length > 0 && (
          <div className="w-full max-w-md flex flex-col gap-2">
            {ok.codigos.map((c) => (
              <div key={c} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0 text-left">
                  <span className="font-medium flex items-center gap-1.5"><span>{emojiRubrica(rubrica)}</span>{nombreDonacion(ok.donante)}</span>
                  <span className="block text-xs text-muted-foreground">{rubrica} · <CopyableText value={c} mono className="text-[11px]" /></span>
                </span>
                <Link href={`/donaciones/${c}`} className="text-primary shrink-0">{esVol ? "Ver voluntariado →" : "Ver donación →"}</Link>
              </div>
            ))}
          </div>
        )}
        {ok.matches.length > 0 && (
          <div className="w-full max-w-md text-left rounded-xl bg-primary/5 p-3 flex flex-col gap-1">
            <p className="text-sm font-semibold">🤖 Avi sugiere dónde hace más falta:</p>
            {ok.matches.slice(0, 5).map((m, i) => (
              <p key={i} className="text-sm">{m.producto && <span className="font-medium capitalize">{m.producto}</span>}{m.hospital && <> → <span className="font-medium">{m.hospital}</span></>}{m.area && <span className="text-primary"> · {m.area}</span>}</p>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 w-full max-w-md mt-1">
          {uno && <CompartirDonacion codigo={uno} />}
          <p className="text-sm text-muted-foreground mt-1">¿Qué quieres hacer ahora?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {uno && <Button onClick={() => onIr(uno)}>{esVol ? "Ver mi voluntariado →" : "Ver mi donación →"}</Button>}
            <Button variant="outline" onClick={onOtra}>{esVol ? "Ofrecer más ayuda" : "Donar algo más"}</Button>
          </div>
          <Link href="/donaciones" className="text-center text-sm text-primary underline mt-1">Quedarme — ir a mis donaciones</Link>
        </div>
      </div>
    </main>
  );
}
