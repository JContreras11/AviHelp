"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/chat-store";

// Convierte URLs del texto en enlaces clicables que abren en nueva pestaña.
function conLinks(texto: string) {
  return texto.split(/(https?:\/\/[^\s)]+)/g).map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" className="underline text-primary break-all">{p}</a>
      : <span key={i}>{p}</span>
  );
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
              {m.rol === "user" ? m.texto : conLinks(m.texto)}
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
