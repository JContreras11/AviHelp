"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/chat-store";

// URLs externas (https) abren en pestaña nueva; rutas internas (/ofrecer, /compartir…) navegan en la misma app.
function conLinks(texto: string) {
  const re = /(https?:\/\/[^\s)]+|\/(?:ofrecer|compartir|refugios|desaparecidos|dashboard|chat|admin\/[a-z]+)[^\s).,]*)/g;
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
export function ChatPanel({ className = "" }: { className?: string }) {
  const { msgs, cargando, grabando, enviar, toggleMic } = useChat();
  const [input, setInput] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje.
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, cargando]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setInput("");
    enviar(q);
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-2">
        {msgs.map((m, i) => (
          <div key={i} className={m.rol === "user" ? "self-end max-w-[85%]" : "self-start max-w-[85%]"}>
            <span className={`inline-block px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.rol === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {m.rol === "user" ? m.texto : renderRich(m.texto)}
            </span>
          </div>
        ))}
        {cargando && <span className="self-start text-sm text-muted-foreground animate-pulse">escribiendo…</span>}
        <div ref={finRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 p-2 border-t bg-background">
        <button type="button" onClick={() => toggleMic((t) => enviar(t))}
          title="Hablar"
          className={`shrink-0 size-10 rounded-full text-lg text-white transition ${grabando ? "bg-red-500 animate-pulse" : "bg-primary hover:opacity-90"}`}>
          {grabando ? "⏹️" : "🎙️"}
        </button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe tu pregunta…"
          className="flex-1 border rounded-lg px-3 text-base min-w-0" />
        <button className="shrink-0 bg-primary text-primary-foreground rounded-lg px-4 text-sm font-medium disabled:opacity-50" disabled={cargando}>
          Enviar
        </button>
      </form>
    </div>
  );
}
