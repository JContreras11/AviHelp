"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { procesarDocumento, procesarTexto, type ProcesarResult } from "@/app/actions/procesar";
import { encolar } from "@/lib/offline";

type Estado = "idle" | "procesando" | "escuchando";

export function Captura() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("idle");
  const [resultado, setResultado] = useState<ProcesarResult | null>(null);
  const [transcript, setTranscript] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const gps = useRef<{ lat: number; lng: number } | null>(null);
  const reco = useRef<SpeechRecognition | null>(null);

  // Pide ubicación al cargar (fallback si la foto no trae GPS).
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => (gps.current = { lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  function mostrar(res: ProcesarResult) {
    setResultado(res);
    setEstado("idle");
    if (res.ok) {
      toast.success(res.resumen || "Registrado");
      router.refresh(); // recarga las listas de registros
    } else {
      toast.error(res.error);
    }
  }

  async function subirFoto(file: File) {
    setResultado(null);
    // Sin conexión: guardar en cola offline para sincronizar después.
    if (!navigator.onLine) {
      await encolar(file, gps.current ?? undefined);
      toast.info("Sin conexión: guardado. Se procesará al volver el internet.");
      return;
    }
    setEstado("procesando");
    const fd = new FormData();
    fd.append("imagen", file);
    if (gps.current) {
      fd.append("gps_lat", String(gps.current.lat));
      fd.append("gps_lng", String(gps.current.lng));
    }
    try {
      mostrar(await procesarDocumento(fd));
    } catch (e: any) {
      mostrar({ ok: false, error: e.message ?? "Error procesando la imagen" });
    }
  }

  async function enviarTexto(texto: string) {
    setResultado(null);
    setEstado("procesando");
    try {
      mostrar(await procesarTexto(texto));
    } catch (e: any) {
      mostrar({ ok: false, error: e.message ?? "Error procesando el audio" });
    }
  }

  // ── Micrófono en tiempo real (Web Speech API) ──
  function toggleMic() {
    if (estado === "escuchando") {
      reco.current?.stop();
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Tu navegador no soporta dictado por voz. Usa Chrome.");
      return;
    }
    const r = new Ctor();
    r.lang = "es-ES";
    r.continuous = true;
    r.interimResults = true;
    let acumulado = "";
    setTranscript("");
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) acumulado += t + " ";
        else interim += t;
      }
      setTranscript(acumulado + interim);
    };
    r.onerror = () => toast.error("Error de micrófono");
    r.onend = () => {
      setEstado("idle");
      const texto = acumulado.trim();
      if (texto) enviarTexto(texto);
    };
    reco.current = r;
    r.start();
    setEstado("escuchando");
  }

  const ocupado = estado === "procesando";

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      {/* Zona de captura */}
      <Card
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) subirFoto(f);
        }}
        onClick={() => !ocupado && fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed p-10 text-center transition
          ${drag ? "border-primary bg-primary/5" : "border-muted-foreground/30"}
          ${ocupado ? "opacity-60 pointer-events-none" : "hover:border-primary"}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFoto(f); }}
        />
        <div className="text-5xl mb-3">📷</div>
        <p className="text-lg font-medium">Toca para tomar o subir una foto</p>
        <p className="text-sm text-muted-foreground mt-1">
          Cédula, lista de pacientes, cartel de desaparecido o lista de insumos.
          La IA detecta qué es y lo registra.
        </p>
      </Card>

      {/* Micrófono */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={toggleMic}
          disabled={ocupado}
          className={`size-20 rounded-full text-3xl text-white shadow-lg transition
            ${estado === "escuchando" ? "bg-red-500 animate-pulse" : "bg-primary hover:opacity-90"}
            ${ocupado ? "opacity-50" : ""}`}
          aria-label="Hablar"
        >
          🎙️
        </button>
        <span className="text-sm text-muted-foreground">
          {estado === "escuchando" ? "Escuchando… toca para detener" : "O habla y dicta la información"}
        </span>
        {transcript && (
          <p className="text-sm italic text-center max-w-md bg-muted rounded-lg px-3 py-2">{transcript}</p>
        )}
      </div>

      {ocupado && (
        <p className="text-center text-muted-foreground animate-pulse">🧠 La IA está leyendo y registrando…</p>
      )}

      {/* Resultado */}
      {resultado && !ocupado && <Resultado res={resultado} />}
    </div>
  );
}

function Resultado({ res }: { res: ProcesarResult }) {
  if (!res.ok)
    return (
      <Card className="p-5 border-destructive/50 bg-destructive/5">
        <p className="font-medium text-destructive">⚠️ {res.error}</p>
      </Card>
    );
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge>{res.tipo.replace(/_/g, " ")}</Badge>
        <Badge variant="secondary">confianza {Math.round(res.confianza * 100)}%</Badge>
        <span className="text-sm text-muted-foreground">{res.contexto}</span>
      </div>
      {res.personas.length > 0 && (
        <div>
          <p className="font-medium mb-1">{res.personas.length} persona(s)</p>
          <ul className="text-sm space-y-0.5 max-h-48 overflow-auto">
            {res.personas.map((p) => (
              <li key={p.id}>
                • {p.nombre} {p.edad ? `(${p.edad})` : ""} — {p.estado_salud}
                {p.ubicacion ? ` · ${p.ubicacion}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {res.insumos.length > 0 && (
        <div>
          <p className="font-medium mb-1">{res.insumos.length} insumo(s)</p>
          <ul className="text-sm space-y-0.5 max-h-48 overflow-auto">
            {res.insumos.map((i) => (
              <li key={i.id}>• {i.nombre} {i.cantidad ? `×${i.cantidad} ${i.unidad ?? ""}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
