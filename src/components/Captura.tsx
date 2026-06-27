"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analizarImagen, analizarVoz, guardarDocumento } from "@/app/actions/procesar";
import { encolar } from "@/lib/offline";
import type { DocumentoAnalizado } from "@/lib/ai/vision";
import type { ColaItem } from "./captura/tipos";
import { DocCard } from "./captura/DocCard";

const CONCURRENCIA = 2;

export function Captura() {
  const router = useRouter();
  const [items, setItems] = useState<ColaItem[]>([]);
  const [escuchando, setEscuchando] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const gps = useRef<{ lat: number; lng: number } | null>(null);
  const reco = useRef<SpeechRecognition | null>(null);
  const enVuelo = useRef<Set<string>>(new Set());

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => (gps.current = { lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const upd = (id: string, patch: Partial<ColaItem>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

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
      } else {
        res = await analizarVoz(it.texto ?? "");
      }
      if (res.ok)
        upd(it.id, { estado: "listo", preview: res.preview, foto: res.foto, exif: res.exif, confianza: res.confianza, modelo: res.modelo });
      else upd(it.id, { estado: "error", error: res.error });
    } catch (e: any) {
      upd(it.id, { estado: "error", error: e?.message ?? "Error" });
    } finally {
      enVuelo.current.delete(it.id);
      tick();
    }
  }

  function agregarFotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    Promise.all(
      arr.map(
        (file) =>
          new Promise<ColaItem>((resolve) => {
            const r = new FileReader();
            r.onload = () =>
              resolve({
                id: crypto.randomUUID(), fuente: "foto", nombre: file.name || "foto.jpg",
                thumb: String(r.result), estado: "pendiente", file,
                gps: gps.current ?? undefined, confianza: 0,
              });
            r.readAsDataURL(file);
          }),
      ),
    ).then((nuevos) => {
      // Sin conexión: a la cola offline.
      if (!navigator.onLine) {
        nuevos.forEach((n) => n.file && encolar(n.file, n.gps));
        toast.info(`${nuevos.length} sin conexión: se procesarán al volver internet.`);
        return;
      }
      setItems((xs) => [...nuevos, ...xs]);
      tick();
    });
  }

  async function guardar(it: ColaItem) {
    if (!it.preview) return;
    upd(it.id, { estado: "guardando" });
    try {
      const res = await guardarDocumento({
        preview: it.preview, foto: it.foto ?? null,
        exif: it.exif ?? { gps_lat: null, gps_lng: null, foto_fecha: null },
        confianza: it.confianza, modelo: it.modelo ?? "",
      });
      if (res.ok) { upd(it.id, { estado: "guardado" }); toast.success(res.resumen); router.refresh(); }
      else upd(it.id, { estado: "listo", error: res.error });
    } catch (e: any) {
      upd(it.id, { estado: "listo", error: e?.message });
    }
  }

  async function guardarTodo() {
    for (const it of items.filter((x) => x.estado === "listo")) await guardar(it);
  }

  function toggleMic() {
    if (escuchando) { reco.current?.stop(); return; }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { toast.error("Tu navegador no soporta dictado. Usa Chrome."); return; }
    const r = new Ctor();
    r.lang = "es-ES"; r.continuous = true; r.interimResults = true;
    let acc = "";
    setTranscript("");
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) acc += t + " "; else interim += t;
      }
      setTranscript(acc + interim);
    };
    r.onerror = () => toast.error("Error de micrófono");
    r.onend = () => {
      setEscuchando(false);
      const texto = acc.trim();
      if (texto) {
        setItems((xs) => [{ id: crypto.randomUUID(), fuente: "voz", nombre: `Dictado: "${texto.slice(0, 30)}…"`, estado: "pendiente", texto, confianza: 0 }, ...xs]);
        tick();
      }
      setTranscript("");
    };
    reco.current = r; r.start(); setEscuchando(true);
  }

  const pendientes = items.filter((x) => ["pendiente", "analizando"].includes(x.estado)).length;
  const listos = items.filter((x) => x.estado === "listo").length;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-5">
      {/* Zona de captura */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) agregarFotos(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition
          ${drag ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary"}`}
      >
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden
          onChange={(e) => { if (e.target.files?.length) agregarFotos(e.target.files); e.target.value = ""; }} />
        <div className="text-4xl mb-2">📷</div>
        <p className="font-medium">Toca o arrastra una o varias fotos</p>
        <p className="text-sm text-muted-foreground mt-1">
          Cada documento se procesa por separado. Revisa y corrige antes de guardar.
        </p>
      </div>

      {/* Micrófono */}
      <div className="flex flex-col items-center gap-2">
        <button onClick={toggleMic}
          className={`size-16 rounded-full text-2xl text-white shadow-lg transition
            ${escuchando ? "bg-red-500 animate-pulse" : "bg-primary hover:opacity-90"}`}
          aria-label="Hablar">🎙️</button>
        <span className="text-xs text-muted-foreground">
          {escuchando ? "Escuchando… toca para detener" : "O habla y dicta la información"}
        </span>
        {transcript && <p className="text-sm italic text-center max-w-md bg-muted rounded-lg px-3 py-2">{transcript}</p>}
      </div>

      {/* Barra de progreso / acciones */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {pendientes > 0 ? `⏳ ${pendientes} procesando…` : "Listo para revisar"}
            {listos > 0 && ` · ${listos} por guardar`}
          </span>
          {listos > 1 && <Button size="sm" onClick={guardarTodo}>Guardar todo ({listos})</Button>}
        </div>
      )}

      {/* Cards por documento */}
      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <DocCard
            key={it.id}
            item={it}
            onChange={(preview: DocumentoAnalizado) => upd(it.id, { preview })}
            onGuardar={() => guardar(it)}
            onDescartar={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}
          />
        ))}
      </div>
    </div>
  );
}
