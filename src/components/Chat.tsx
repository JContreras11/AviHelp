"use client";

import { useState } from "react";
import { preguntar } from "@/app/actions/chat";
import { Card } from "@/components/ui/card";

type Msg = { rol: "user" | "bot"; texto: string };

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { rol: "bot", texto: "Pregúntame por una persona o un insumo. Ej: «¿Tienen info de Juan Pérez visto en Petare?»" },
  ]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || cargando) return;
    setMsgs((m) => [...m, { rol: "user", texto: q }]);
    setInput("");
    setCargando(true);
    try {
      const { respuesta } = await preguntar(q);
      setMsgs((m) => [...m, { rol: "bot", texto: respuesta }]);
    } catch {
      setMsgs((m) => [...m, { rol: "bot", texto: "Error consultando. Intenta de nuevo." }]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-2xl mx-auto">
      <Card className="p-4 flex flex-col gap-3 min-h-[50vh] max-h-[60vh] overflow-auto">
        {msgs.map((m, i) => (
          <div key={i} className={m.rol === "user" ? "self-end" : "self-start"}>
            <span
              className={`inline-block px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.rol === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {m.texto}
            </span>
          </div>
        ))}
        {cargando && <span className="self-start text-sm text-muted-foreground animate-pulse">escribiendo…</span>}
      </Card>
      <form onSubmit={enviar} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button className="bg-primary text-primary-foreground rounded-lg px-4 text-sm font-medium disabled:opacity-50" disabled={cargando}>
          Enviar
        </button>
      </form>
    </div>
  );
}
