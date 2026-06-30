"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analizarImagen, analizarVoz, analizarAudio, guardarDocumento } from "@/app/actions/procesar";
import { analizarPDF, analizarExcel, analizarDOCX, analizarURL, listarHospitalesSelect } from "@/app/actions/ingesta";
import { decodeQR, tipoArchivo } from "@/lib/qr";
import { pdfAPaginasPNG } from "@/lib/pdf-render";
import { encolar } from "@/lib/offline";
import { realzarImagen } from "@/lib/realce";
import { useRol } from "@/lib/rol";
import type { DocumentoAnalizado } from "@/lib/ai/vision";
import type { ColaItem } from "./captura/tipos";
import { DocCard } from "./captura/DocCard";
import { HospitalSelect, type HospFiltro } from "./captura/HospitalSelect";

const CONCURRENCIA = 2;

export function Captura({ soloCola = false }: { soloCola?: boolean } = {}) {
  const { puede } = useRol();
  const qc = useQueryClient();
  const refrescar = () => {
    ["personas", "insumos", "hospitales", "centros"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    listarHospitalesSelect().then(setHospitales).catch(() => {}); // por si se creó una institución nueva
  };
  const [items, setItems] = useState<ColaItem[]>([]);
  const [hospitales, setHospitales] = useState<{ id: string; nombre: string; tipo: string }[]>([]);
  const [grabando, setGrabando] = useState(false);
  const [segs, setSegs] = useState(0);
  const [drag, setDrag] = useState(false);
  const [guardandoTodo, setGuardandoTodo] = useState(false);
  const [texto, setTexto] = useState("");
  const [urlIn, setUrlIn] = useState("");
  const [hospGlobal, setHospGlobal] = useState<HospFiltro>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const gps = useRef<{ lat: number; lng: number } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const enVuelo = useRef<Set<string>>(new Set());
  // Institución global "pegajosa": se aplica también a las tarjetas que terminan DESPUÉS de
  // elegirla (caso típico: PDF de muchas páginas que van llegando una a una).
  const hospGlobalRef = useRef<HospFiltro>(null);

  // Lista de instituciones existentes para emparejar (evita duplicados al guardar).
  useEffect(() => { listarHospitalesSelect().then(setHospitales).catch(() => {}); }, []);

  // Archivos arrastrados/soltados en el chat de Avi entran al MISMO pipeline.
  useEffect(() => {
    const h = (e: Event) => { const fs = (e as CustomEvent).detail as File[]; if (fs?.length) agregarArchivos(fs); };
    window.addEventListener("avi-cargar", h);
    return () => window.removeEventListener("avi-cargar", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => (gps.current = { lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const upd = (id: string, patch: Partial<ColaItem>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Asignador GLOBAL: pone la misma institución a TODAS las tarjetas listas de un golpe.
  // Cada tarjeta puede luego cambiarla individualmente (override) sin afectar a las demás.
  function asignarHospitalTodos(h: HospFiltro) {
    setHospGlobal(h);
    hospGlobalRef.current = h;
    setItems((xs) =>
      xs.map((x) =>
        x.estado === "listo" && x.preview ? { ...x, preview: { ...x.preview, hospital: h } } : x,
      ),
    );
  }

  // Reintentar un ítem que falló (la IA a veces falla una página densa; un reintento suele bastar).
  function reintentar(id: string) {
    enVuelo.current.delete(id);
    upd(id, { estado: "pendiente", error: undefined });
    tick();
  }

  // Procesa la cola respetando la concurrencia.
  function tick() {
    setItems((xs) => {
      const pend = xs.filter((x) => x.estado === "pendiente" && !enVuelo.current.has(x.id));
      const libres = CONCURRENCIA - enVuelo.current.size;
      pend.slice(0, Math.max(0, libres)).forEach((it) => {
        enVuelo.current.add(it.id);
        analizar(it);
      });
      return xs;
    });
  }

  async function analizar(it: ColaItem) {
    upd(it.id, { estado: "analizando" });
    try {
      let res;
      if (it.fuente === "foto" && it.file) {
        const fd = new FormData();
        fd.append("imagen", it.file);
        if (it.gps) { fd.append("gps_lat", String(it.gps.lat)); fd.append("gps_lng", String(it.gps.lng)); }
        res = await analizarImagen(fd);
      } else if (it.fuente === "pdf" && it.file) {
        const fd = new FormData(); fd.append("archivo", it.file);
        res = await analizarPDF(fd);
      } else if (it.fuente === "excel" && it.file) {
        const fd = new FormData(); fd.append("archivo", it.file);
        res = await analizarExcel(fd);
      } else if (it.fuente === "docx" && it.file) {
        const fd = new FormData(); fd.append("archivo", it.file);
        res = await analizarDOCX(fd);
      } else if (it.fuente === "qr" && it.url) {
        res = await analizarURL(it.url);
      } else if (it.fuente === "audio" && it.audio) {
        const fd = new FormData();
        fd.append("audio", it.audio, `audio.${(it.audio.type.split("/")[1] ?? "webm").split(";")[0]}`);
        res = await analizarAudio(fd);
      } else {
        res = await analizarVoz(it.texto ?? "");
      }
      if (res.ok) {
        // Si ya hay institución global elegida, esta tarjeta (recién lista) también la hereda.
        const preview = hospGlobalRef.current ? { ...res.preview, hospital: hospGlobalRef.current } : res.preview;
        upd(it.id, { estado: "listo", preview, foto: res.foto, exif: res.exif, confianza: res.confianza, modelo: res.modelo });
      } else upd(it.id, { estado: "error", error: res.error });
    } catch (e: any) {
      upd(it.id, { estado: "error", error: e?.message ?? "Error" });
    } finally {
      enVuelo.current.delete(it.id);
      tick();
    }
  }

  // Imagen -> realce + thumb (flujo foto existente). Detecta QR primero: si trae enlace, va por flujo QR.
  async function itemImagen(original: File): Promise<ColaItem> {
    const qr = await decodeQR(original).catch(() => null);
    if (qr && /^https?:\/\//i.test(qr)) {
      return { id: crypto.randomUUID(), fuente: "qr", nombre: `🔳 QR: ${original.name || "lista"}`, estado: "pendiente", url: qr, confianza: 0 };
    }
    const file = await realzarImagen(original);
    const thumb: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
    return { id: crypto.randomUUID(), fuente: "foto", nombre: original.name || "foto.jpg", thumb, estado: "pendiente", file, gps: gps.current ?? undefined, confianza: 0 };
  }

  // Enruta CUALQUIER archivo por su tipo: imagen/QR (existente) · PDF · Excel/CSV. Todo termina en la misma preview.
  async function agregarArchivos(files: FileList | File[]) {
    const arr = Array.from(files);
    const nuevos: ColaItem[] = [];
    let ignorados = 0;
    for (const f of arr) {
      const t = tipoArchivo(f.name, f.type);
      if (t === "foto") nuevos.push(await itemImagen(f));
      else if (t === "pdf") {
        // PDF -> PNG por página EN EL CLIENTE y se leen como imágenes (la visión funciona mejor
        // que el texto colapsado). Fallback al parseo server-side si el render falla.
        try {
          const tid = toast.loading(`Convirtiendo ${f.name} a imágenes…`);
          const paginas = await pdfAPaginasPNG(f);
          toast.dismiss(tid);
          if (!paginas.length) throw new Error("sin páginas");
          for (const pg of paginas) nuevos.push(await itemImagen(pg));
        } catch {
          nuevos.push({ id: crypto.randomUUID(), fuente: "pdf", nombre: `📕 ${f.name}`, estado: "pendiente", file: f, confianza: 0 });
        }
      }
      else if (t === "excel") nuevos.push({ id: crypto.randomUUID(), fuente: "excel", nombre: `📊 ${f.name}`, estado: "pendiente", file: f, confianza: 0 });
      else if (t === "docx") nuevos.push({ id: crypto.randomUUID(), fuente: "docx", nombre: `📄 ${f.name}`, estado: "pendiente", file: f, confianza: 0 });
      else ignorados++;
    }
    if (ignorados) toast.error(`${ignorados} archivo(s) en formato no soportado (usa imagen, PDF, Excel o Word).`);
    if (!nuevos.length) return;
    // Sin conexión: solo las fotos se encolan (las demás necesitan servidor).
    if (!navigator.onLine) {
      const fotos = nuevos.filter((n) => n.fuente === "foto" && n.file);
      fotos.forEach((n) => n.file && encolar(n.file, n.gps));
      if (fotos.length) toast.info(`${fotos.length} sin conexión: se procesarán al volver internet.`);
      if (nuevos.length > fotos.length) toast.error("PDF/Excel/QR requieren conexión a internet.");
      return;
    }
    setItems((xs) => [...nuevos, ...xs]);
    tick();
  }

  async function guardar(it: ColaItem) {
    if (!it.preview) return;
    // Cada insumo debe tener Servicio/Departamento (micro-routing logístico).
    const sinServicio = (it.preview.insumos ?? []).filter((i) => i.nombre && !i.area?.trim());
    if (sinServicio.length) { toast.error(`Falta el Servicio/Departamento en ${sinServicio.length} insumo(s).`); return; }
    upd(it.id, { estado: "guardando" });
    try {
      const res = await guardarDocumento({
        preview: it.preview, foto: it.foto ?? null,
        exif: it.exif ?? { gps_lat: null, gps_lng: null, foto_fecha: null },
        confianza: it.confianza, modelo: it.modelo ?? "", notas: it.notas,
      });
      if (res.ok) { upd(it.id, { estado: "guardado" }); toast.success(res.resumen); refrescar(); }
      // En error: vuelve a "listo" conservando lo cargado y AVISA (antes fallaba en silencio).
      else { upd(it.id, { estado: "listo", error: res.error }); toast.error(res.error ?? "No se pudo guardar. Inténtalo de nuevo."); }
    } catch (e: any) {
      upd(it.id, { estado: "listo", error: e?.message });
      toast.error(e?.message ?? "No se pudo guardar. Revisa tu conexión.");
    }
  }

  // Guarda en serie; bloquea el botón para no duplicar y evita perder lo no guardado.
  async function guardarTodo() {
    if (guardandoTodo) return;
    setGuardandoTodo(true);
    try { for (const it of items.filter((x) => x.estado === "listo")) await guardar(it); }
    finally { setGuardandoTodo(false); }
  }

  // Micrófono: graba audio real (MediaRecorder) y lo transcribe en el servidor.
  // Funciona en todos los navegadores (Chrome, Safari, Brave, Firefox), a diferencia de Web Speech.
  function detenerTimer() { if (timer.current) { clearInterval(timer.current); timer.current = null; } }

  async function toggleMic() {
    if (grabando) { rec.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Tu dispositivo no permite grabar audio."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => {
        detenerTimer(); setGrabando(false); setSegs(0);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType });
        if (blob.size < 800) { toast.error("Grabación muy corta."); return; }
        setItems((xs) => [{ id: crypto.randomUUID(), fuente: "audio", nombre: "🎙️ Nota de voz", estado: "pendiente", audio: blob, confianza: 0 }, ...xs]);
        tick();
      };
      rec.current = mr; mr.start();
      setGrabando(true); setSegs(0);
      timer.current = setInterval(() => setSegs((s) => s + 1), 1000);
    } catch {
      toast.error("No se pudo acceder al micrófono. Revisa los permisos.");
    }
  }

  function agregarTexto() {
    const t = texto.trim();
    if (!t) return;
    setItems((xs) => [{ id: crypto.randomUUID(), fuente: "voz", nombre: "✍️ Texto pegado", estado: "pendiente", texto: t, confianza: 0 }, ...xs]);
    setTexto("");
    tick();
  }

  // Enlace de un QR de lista (pegar la URL directamente, sin foto).
  function agregarURL(u: string) {
    const url = u.trim();
    if (!/^https?:\/\//i.test(url)) { toast.error("Pega un enlace válido (https://…)"); return; }
    setItems((xs) => [{ id: crypto.randomUUID(), fuente: "qr", nombre: `🔗 ${url.slice(0, 40)}`, estado: "pendiente", url, confianza: 0 }, ...xs]);
    setUrlIn("");
    tick();
  }

  const pendientes = items.filter((x) => ["pendiente", "analizando"].includes(x.estado)).length;
  const listos = items.filter((x) => x.estado === "listo").length;

  // Solo responsables/representantes verificados suben documentos. El público solo consulta.
  if (!puede("cargar")) return null;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-5">
      {/* Inputs nativos: galería/archivos (sin capture) y cámara (capture). */}
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv,.docx" multiple hidden
        onChange={(e) => { if (e.target.files?.length) agregarArchivos(e.target.files); e.target.value = ""; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { if (e.target.files?.length) agregarArchivos(e.target.files); e.target.value = ""; }} />

      {!soloCola && (<>
      {/* Invitación a Avi: para consultar/buscar, mejor el chat. */}
      <div className="max-w-2xl mx-auto w-full rounded-2xl border bg-gradient-to-r from-primary/10 to-transparent p-3 flex items-center gap-3">
        <span className="text-2xl shrink-0">💬</span>
        <p className="text-sm flex-1">¿Buscar o preguntar algo? <strong>Habla con Avi</strong> — escríbele o pégale una lista y él la entiende.</p>
        <Link href="/chat" className="shrink-0 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">Abrir Avi</Link>
      </div>

      {/* Cargar por pestañas: archivo · texto/enlace · voz (ergonómico, sin amontonar). */}
      <div className="max-w-2xl mx-auto w-full">
        <Tabs defaultValue="archivo">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="archivo" className="flex-1">📎 Archivo / foto</TabsTrigger>
            <TabsTrigger value="texto" className="flex-1">✍️ Texto / enlace</TabsTrigger>
            <TabsTrigger value="voz" className="flex-1">🎙️ Voz</TabsTrigger>
          </TabsList>

          <TabsContent value="archivo">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) agregarArchivos(e.dataTransfer.files); }}
              className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
            >
              <div className="text-4xl mb-2">📷</div>
              <p className="font-medium">Arrastra aquí o elige un archivo</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Foto, PDF, Excel/CSV, Word o un QR de lista. La IA detecta si es lista de personas o insumos. Revisa antes de guardar.</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button size="lg" type="button" onClick={() => fileRef.current?.click()}>🖼️ Elegir archivo</Button>
                <Button size="lg" type="button" variant="outline" onClick={() => camRef.current?.click()}>📷 Tomar foto</Button>
                <Button size="lg" type="button" variant="outline" onClick={() => camRef.current?.click()}>🔳 Escanear QR</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="texto">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
                  placeholder="Pega aquí una lista de pacientes o insumos, o cualquier texto a registrar."
                  className="border rounded-xl p-3 text-base bg-background w-full" />
                <Button onClick={agregarTexto} disabled={!texto.trim()} className="self-end">Procesar texto</Button>
              </div>
              <div className="flex gap-2 border-t pt-3">
                <input value={urlIn} onChange={(e) => setUrlIn(e.target.value)} inputMode="url"
                  placeholder="🔳 o pega el enlace de un QR / lista (https://…)"
                  className="flex-1 border rounded-lg px-3 h-11 text-base bg-background min-w-0" />
                <Button type="button" onClick={() => agregarURL(urlIn)} disabled={!urlIn.trim()}>Procesar</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="voz">
            <div className="flex flex-col items-center gap-3 py-4">
              <button onClick={toggleMic}
                className={`relative grid place-items-center size-20 rounded-full text-3xl text-white shadow-lg transition active:scale-95
                  ${grabando ? "bg-red-500" : "bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-500"}`}
                aria-label="Grabar nota de voz">
                {grabando && <span className="absolute inset-0 rounded-full bg-red-400/50 animate-ping" />}
                <span className="relative">{grabando ? "⏹️" : "🎙️"}</span>
              </button>
              <span className="text-sm text-muted-foreground text-center" aria-live="polite" role="status">
                {grabando ? `🔴 Grabando ${Math.floor(segs / 60)}:${String(segs % 60).padStart(2, "0")} — toca para detener` : "Toca y dicta una lista o nota; la IA la transcribe y estructura."}
              </span>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      </>)}

      {/* COLA: feedback inmediato JUSTO debajo de la subida. Masonry: 1 col móvil, 2-3 en PC. */}
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground" aria-live="polite" role="status">
              {pendientes > 0 ? `⏳ ${pendientes} procesando…` : "Listo para revisar"}
              {listos > 0 && ` · ${listos} por guardar`}
            </span>
            {listos > 1 && <Button size="sm" onClick={guardarTodo} disabled={guardandoTodo}>{guardandoTodo ? "Guardando…" : `Guardar todo (${listos})`}</Button>}
          </div>

          {/* Asignar la MISMA institución a todas las tarjetas a la vez (cada una puede cambiarla después). */}
          {listos > 1 && (
            <div className="rounded-xl border bg-muted/30 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="text-sm font-medium shrink-0">🏥 Asignar todas a:</label>
              <div className="flex-1 min-w-0">
                <HospitalSelect
                  hospitales={hospitales}
                  value={hospGlobal}
                  onChange={asignarHospitalTodos}
                  placeholder="Elegir institución para todas…"
                />
              </div>
            </div>
          )}
          <div className="gap-3 columns-1 md:columns-2 xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
            {items.map((it) => (
              <DocCard
                key={it.id}
                item={it}
                hospitales={hospitales}
                onReintentar={() => reintentar(it.id)}
                onChange={(preview: DocumentoAnalizado) => upd(it.id, { preview })}
                onNotas={(notas: string) => upd(it.id, { notas })}
                onGuardar={() => guardar(it)}
                onDescartar={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
