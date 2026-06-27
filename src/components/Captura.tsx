"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analizarImagen, analizarVoz, analizarAudio, guardarDocumento } from "@/app/actions/procesar";
import { encolar } from "@/lib/offline";
import { realzarImagen } from "@/lib/realce";
import type { DocumentoAnalizado } from "@/lib/ai/vision";
import type { ColaItem } from "./captura/tipos";
import { DocCard } from "./captura/DocCard";

const CONCURRENCIA = 2;

export function Captura() {
  const router = useRouter();
  const [items, setItems] = useState<ColaItem[]>([]);
  const [grabando, setGrabando] = useState(false);
  const [segs, setSegs] = useState(0);
  const [drag, setDrag] = useState(false);
  const [texto, setTexto] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const gps = useRef<{ lat: number; lng: number } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
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
      } else if (it.fuente === "audio" && it.audio) {
        const fd = new FormData();
        fd.append("audio", it.audio, `audio.${(it.audio.type.split("/")[1] ?? "webm").split(";")[0]}`);
        res = await analizarAudio(fd);
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
        (original) =>
          // Realza el documento (contraste/tamaño) antes de OCR y subida.
          realzarImagen(original).then((file) => new Promise<ColaItem>((resolve) => {
            const r = new FileReader();
            r.onload = () =>
              resolve({
                id: crypto.randomUUID(), fuente: "foto", nombre: original.name || "foto.jpg",
                thumb: String(r.result), estado: "pendiente", file,
                gps: gps.current ?? undefined, confianza: 0,
              });
            r.readAsDataURL(file);
          })),
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
      if (res.ok) { upd(it.id, { estado: "guardado" }); toast.success(res.resumen); router.refresh(); }
      else upd(it.id, { estado: "listo", error: res.error });
    } catch (e: any) {
      upd(it.id, { estado: "listo", error: e?.message });
    }
  }

  async function guardarTodo() {
    for (const it of items.filter((x) => x.estado === "listo")) await guardar(it);
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
            ${grabando ? "bg-red-500 animate-pulse" : "bg-primary hover:opacity-90"}`}
          aria-label="Grabar nota de voz">{grabando ? "⏹️" : "🎙️"}</button>
        <span className="text-sm text-muted-foreground">
          {grabando ? `🔴 Grabando ${Math.floor(segs / 60)}:${String(segs % 60).padStart(2, "0")} — toca para detener` : "O graba una nota de voz"}
        </span>
      </div>

      {/* Pegar texto / lista (Excel, documento, etc.) */}
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">✍️ Pegar texto o lista (Excel, documento…)</summary>
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
            placeholder="Pega aquí una lista de pacientes o insumos, o cualquier texto a registrar."
            className="border rounded-lg p-2 text-base bg-background" />
          <Button onClick={agregarTexto} disabled={!texto.trim()} className="self-end">Procesar texto</Button>
        </div>
      </details>

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
            onNotas={(notas: string) => upd(it.id, { notas })}
            onGuardar={() => guardar(it)}
            onDescartar={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}
          />
        ))}
      </div>
    </div>
  );
}
