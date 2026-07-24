"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Mic, Square, Paperclip } from "lucide-react";
import { useChat } from "@/lib/chat-store";
import { subscribeAvi, type AviIntent } from "@/lib/avi-bus";
import { useRol } from "@/lib/rol";
import { presentacionDe } from "@/components/DonarInsumo";
import { ResultadoCards } from "@/components/chat/ResultadoCards";
import { Captura } from "@/components/Captura";

// URLs externas (https) abren en pestaña nueva; rutas internas (/ofrecer, /compartir…) navegan en la misma app.
function conLinks(texto: string) {
  const re = /(https?:\/\/[^\s)]+|\/(?:ofrecer|compartir|refugios|desaparecidos|dashboard|chat|solicitud(?:es)?|donaciones|mis-cargas|mis-donaciones|admin\/[a-z]+)[^\s).,]*)/g;
  return texto.split(re).map((p, i) => {
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="underline text-primary break-all">{p}</a>;
    if (/^\//.test(p)) return <a key={i} href={p} className="underline text-primary font-medium">{p}</a>;
    return <span key={i}>{p}</span>;
  });
}

// Negrita **texto** dentro de una línea (manteniendo los enlaces).
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={key + "b" + i}>{conLinks(p.slice(2, -2))}</strong>
      : <span key={key + "s" + i}>{conLinks(p)}</span>
  );
}

// Mensaje inicial por flujo cuando una página invoca a Avi sin texto explícito.
// El flujo (solicitud/donacion/persona) orienta la conversación; Avi responde con la guía/enlace.
function mensajePorFlow(flow?: AviIntent["flow"]): string | undefined {
  switch (flow) {
    case "solicitud": return "Quiero registrar una solicitud de insumos para mi centro de salud.";
    case "donacion": return "Quiero registrar una donación de insumos que tengo para entregar.";
    // "persona" quedó desactivado: la plataforma ya no gestiona búsqueda/reporte de personas.
    default: return undefined;
  }
}

// Render de texto rico del asistente: párrafos, viñetas (*, -, •), negrita y enlaces.
function renderRich(texto: string) {
  const lines = texto.split("\n");
  const out: any[] = [];
  let buf: any[] = [];
  const flush = () => { if (buf.length) { out.push(<ul key={"u" + out.length} className="list-disc pl-5 my-1 space-y-0.5">{buf}</ul>); buf = []; } };
  lines.forEach((ln, i) => {
    const m = ln.match(/^\s*[*\-•]\s+(.*)/);
    if (m) buf.push(<li key={"l" + i}>{inline(m[1], "l" + i)}</li>);
    else { flush(); if (ln.trim()) out.push(<p key={"p" + i}>{inline(ln, "p" + i)}</p>); }
  });
  flush();
  return <div className="flex flex-col gap-1">{out}</div>;
}

// Panel de chat reutilizable: misma conversación en la página /chat y en el widget.
// `prefill` lo inyecta quien controla la apertura (p.ej. ChatWidget) vía avi-bus.
export function ChatPanel({ className = "", prefill, embedUploads = false }: { className?: string; prefill?: { text: string; nonce: number; send?: boolean }; embedUploads?: boolean }) {
  const { msgs, cargando, grabando, enviar, toggleMic, subirArchivos, nudge } = useChat();
  const { puede } = useRol();
  const pathname = usePathname();
  const subir = puede("cargar"); // staff verificado: puede arrastrar imágenes/documentos a Avi
  // FIX 24: adjuntar/arrastrar/pegar imágenes NO requiere estar registrado. Cualquiera puede
  // enviar una foto (p. ej. de sus insumos) para que Avi la lea y lo encamine a donar.
  const puedeAdjuntar = true;
  // Cola de carga DENTRO del chat: hace VISIBLE lo que se sube por Avi (preview + Guardar +
  // confirmación) sin depender de un panel de página. Se evita en rutas que YA montan <Captura>
  // (home y /documentos) para no duplicar el listener de "avi-cargar".
  const embedCola = subir && embedUploads && pathname !== "/" && pathname !== "/documentos";
  const [input, setInput] = useState("");
  const [drag, setDrag] = useState(false);
  // FIX 23: imágenes en cola con PREVISUALIZACIÓN antes de enviarlas (pegar con Ctrl+V, arrastrar o adjuntar).
  const [staged, setStaged] = useState<{ file: File; url: string }[]>([]);
  const listaRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: File[]) => {
    const nuevos = files.filter((f) => f && f.size > 0).map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (nuevos.length) setStaged((s) => [...s, ...nuevos]);
  };
  const quitarStaged = (i: number) => setStaged((s) => { const x = s[i]; if (x) URL.revokeObjectURL(x.url); return s.filter((_, k) => k !== i); });
  function enviarStaged() {
    if (!staged.length) return;
    subirArchivos(staged.map((s) => s.file));
    staged.forEach((s) => URL.revokeObjectURL(s.url));
    setStaged([]);
  }
  // Limpieza de object URLs al desmontar.
  useEffect(() => () => { staged.forEach((s) => URL.revokeObjectURL(s.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function soltar(e: React.DragEvent) {
    e.preventDefault(); setDrag(false);
    if (puedeAdjuntar && e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  }

  // FIX 23: pegar imagen desde el portapapeles (Ctrl+V) → se agrega a la cola de previsualización.
  function pegar(e: React.ClipboardEvent) {
    if (!puedeAdjuntar) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgs = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile()).filter((f): f is File => !!f);
    if (imgs.length) { e.preventDefault(); addFiles(imgs); }
  }

  // Auto-scroll DENTRO del chat (no mover la página): ajusta el scroll del contenedor.
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, cargando]);

  // avi-bus: cualquier página puede prellenar el input de Avi (contextos siempre montados:
  // /chat y home). Si la intención trae solo `flow` (sin texto), arrancamos con un mensaje
  // orientado a ese flujo para que Avi guíe (crear solicitud / donar).
  useEffect(() => subscribeAvi((i) => {
    const msg = i.message ?? mensajePorFlow(i.flow);
    if (msg != null) setInput(msg);
  }), []);

  // Prefill inyectado por el contenedor que abre el panel (ChatWidget) tras un avi-bus intent.
  // Si viene de un FLUJO (send=true), Avi arranca solo (lo envía) para DAR un resultado, no solo guiar.
  useEffect(() => {
    if (prefill?.text == null) return;
    if (prefill.send) { setInput(""); enviar(prefill.text); }
    else setInput(prefill.text);
  }, [prefill?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inactividad: si el usuario está en el chat y lleva rato sin hablar, Avi lanza un tip útil.
  useEffect(() => {
    const t = setTimeout(() => { if (!cargando) nudge(); }, 35000);
    return () => clearTimeout(t);
  }, [msgs, cargando, nudge]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setInput("");
    enviar(q);
  }

  return (
    <div className={`relative flex flex-col min-h-0 ${className}`}
      onDragOver={(e) => { if (puedeAdjuntar) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={soltar}>
      {puedeAdjuntar && drag && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
          <p className="text-primary font-semibold">📎 Suelta para que Avi lo lea</p>
        </div>
      )}
      <div ref={listaRef} className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-2">
        {msgs.map((m, i) => (
          <div key={i} className={m.rol === "user" ? "self-end max-w-[85%]" : "self-start max-w-[90%]"}>
            {m.archivo ? (
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-sm bg-primary text-primary-foreground animate-in fade-in slide-in-from-bottom-2 duration-300">
                <span className="grid place-items-center size-8 rounded-md bg-white/20 text-[10px] font-bold">{m.archivo.formato}</span>
                <span className="flex flex-col leading-tight">
                  <span className="font-medium">Archivo subido</span>
                  <span className="text-[11px] opacity-90 truncate max-w-[180px]">{m.archivo.nombre}</span>
                </span>
              </span>
            ) : (
              <span className={`inline-block px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.rol === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.rol === "user" ? m.texto : renderRich(m.texto)}
              </span>
            )}
            {/* Tarjetas de resultados (personas/insumos/instituciones): clic -> modal (según permisos). */}
            {m.rol === "bot" && m.resultados && <ResultadoCards resultados={m.resultados} />}
            {/* FIX 22: insumos que faltan → SIEMPRE se dona vía centro de acopio (no donación
                directa). El botón encamina al flujo /donaciones/crear (elige centro cercano). */}
            {m.rol === "bot" && m.insumos && (
              <div className="mt-2 flex flex-col gap-2">
                {m.insumos.map((it: any) => (
                  <div key={it.id} className="rounded-xl border bg-card p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold capitalize text-sm leading-tight">{it.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {it.cantidad ?? "—"}{presentacionDe(it) ? ` ${presentacionDe(it)}` : ""}
                        {it.hospitales?.nombre ? ` · 🏥 ${it.hospitales.nombre}` : ""}
                      </p>
                    </div>
                    <a href={it.hospital_id ? `/donaciones/crear?hospital=${it.hospital_id}` : "/donaciones/crear"}
                      className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 h-9 text-sm font-medium hover:opacity-90 active:scale-95 transition">
                      Donar
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {cargando && <span className="self-start text-sm text-muted-foreground animate-pulse">escribiendo…</span>}
        {/* Resultado VISIBLE de las cargas hechas por Avi: preview editable + Guardar, aquí mismo. */}
        {embedCola && (
          <div className="mt-1 border-t pt-2">
            <Captura soloCola />
          </div>
        )}
      </div>
      {/* FIX 23: previsualización de imágenes en cola (pegadas, arrastradas o adjuntadas) antes de enviarlas. */}
      {staged.length > 0 && (
        <div className="flex items-center gap-2 p-2 border-t bg-background overflow-x-auto">
          {staged.map((s, i) => (
            <div key={i} className="relative shrink-0">
              {s.file.type.startsWith("image/")
                ? <img src={s.url} alt="" className="size-14 rounded-lg object-cover ring-1 ring-border" />
                : <span className="grid place-items-center size-14 rounded-lg border text-[10px] font-bold text-muted-foreground">{(s.file.name.split(".").pop() || "?").toUpperCase()}</span>}
              <button type="button" onClick={() => quitarStaged(i)} aria-label="Quitar"
                className="absolute -top-1.5 -right-1.5 size-5 grid place-items-center rounded-full bg-foreground text-background text-xs">✕</button>
            </div>
          ))}
          <button type="button" onClick={enviarStaged} disabled={cargando}
            className="shrink-0 ml-auto bg-primary text-primary-foreground rounded-lg px-3 h-10 text-sm font-medium disabled:opacity-50">
            Enviar {staged.length} archivo{staged.length > 1 ? "s" : ""}
          </button>
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 p-2 border-t bg-background">
        {/* FIX 24: adjuntar imágenes disponible para cualquiera (con o sin cuenta). El staff
            además puede adjuntar PDF/Excel/Word para catalogar. Todo entra por la cola de previsualización. */}
        {puedeAdjuntar && (
          <>
            <input ref={fileRef} type="file" multiple hidden
              accept={subir ? "image/*,application/pdf,.pdf,.xlsx,.xls,.csv,.docx" : "image/*"}
              onChange={(e) => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Adjuntar imagen" aria-label="Adjuntar imagen"
              className="shrink-0 grid place-items-center size-11 rounded-full border text-muted-foreground hover:bg-muted active:scale-95 transition">
              <Paperclip className="size-5" />
            </button>
          </>
        )}
        {/* Micrófono: gradiente animado + glow; al grabar, ondas rojas. */}
        <button type="button" onClick={() => toggleMic((t) => enviar(t))}
          title="Habla con Avi" aria-label="Habla con Avi"
          className={`relative shrink-0 grid place-items-center size-11 rounded-full text-white overflow-visible active:scale-95
            transition-[background-position,box-shadow,transform] duration-700 bg-[length:280%_auto] bg-gradient-to-tr
            ${grabando
              ? "from-rose-500 via-red-400 to-rose-500 shadow-[0_0_22px_rgba(244,63,94,0.6)]"
              : "from-emerald-500 via-teal-400 to-emerald-500 hover:bg-right shadow-[0_0_18px_rgba(45,212,191,0.55)]"}`}>
          {grabando ? (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-400/50 animate-ping" />
              <span className="absolute -inset-1.5 rounded-full border-2 border-rose-300/40 animate-pulse" />
            </>
          ) : (
            <span className="absolute -inset-1 rounded-full bg-teal-400/25 animate-ping [animation-duration:3s]" />
          )}
          {grabando ? <Square className="relative size-4 fill-current" /> : <Mic className="relative size-5" />}
        </button>

        {grabando ? (
          <div className="flex-1 flex items-center gap-2 h-11 px-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900">
            <span className="flex items-center gap-0.5">
              <span className="w-1 h-2 rounded-full bg-rose-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-4 rounded-full bg-rose-500 animate-bounce [animation-delay:120ms]" />
              <span className="w-1 h-3 rounded-full bg-rose-500 animate-bounce [animation-delay:240ms]" />
              <span className="w-1 h-5 rounded-full bg-rose-500 animate-bounce [animation-delay:360ms]" />
              <span className="w-1 h-2 rounded-full bg-rose-500 animate-bounce [animation-delay:180ms]" />
            </span>
            <span className="text-sm font-medium text-rose-600 dark:text-rose-300">Escuchando… toca para enviar</span>
          </div>
        ) : (
          <input value={input} onChange={(e) => setInput(e.target.value)} onPaste={pegar} placeholder="Escribe, pega una imagen o habla con Avi…"
            className="flex-1 border rounded-lg px-3 h-11 text-base min-w-0" />
        )}
        <button className="shrink-0 bg-primary text-primary-foreground rounded-lg px-4 h-11 text-sm font-medium disabled:opacity-50" disabled={cargando || grabando}>
          Enviar
        </button>
      </form>
    </div>
  );
}
