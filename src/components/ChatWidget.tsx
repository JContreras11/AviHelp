"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatPanel } from "@/components/ChatPanel";
import { Logo } from "@/components/Brand";
import { subscribeAvi, type AviIntent } from "@/lib/avi-bus";

// Mensaje inicial por flujo cuando se invoca a Avi sin texto explícito.
function mensajePorFlow(flow?: AviIntent["flow"]): string | undefined {
  switch (flow) {
    case "solicitud": return "Quiero crear una solicitud para compartir lo que necesita mi centro de salud.";
    case "donacion": return "Quiero donar o ayudar con insumos. ¿Cómo lo hago?";
    case "persona": return "Quiero reportar o buscar a una persona.";
    default: return undefined;
  }
}

// Burbuja flotante bottom-right que despliega el chat. Misma conversación que /chat.
// Oculto en la propia página /chat (ahí se ve completo) y en login/print.
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>();
  const path = usePathname();

  // avi-bus: una intención abre la burbuja y prellena el input de Avi. Si solo trae `flow`
  // (sin texto), arrancamos con un mensaje orientado a ese flujo para que Avi guíe.
  useEffect(() => subscribeAvi((i) => {
    setOpen(true);
    const msg = i.message ?? mensajePorFlow(i.flow);
    if (msg != null) setPrefill({ text: msg, nonce: Date.now() });
  }), []);

  if (path === "/chat" || path === "/login" || path.startsWith("/print")) return null;
  // El home ya tiene el chat de Avi embebido (anónimo y logueado): sin burbuja flotante.
  if (path === "/") return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div role="dialog" aria-label="Chat con Avi"
          className="w-[min(92vw,380px)] h-[min(70vh,560px)] max-h-[calc(100dvh-6rem)] rounded-2xl border bg-card shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 p-3 border-b bg-gradient-to-r from-primary/10 to-transparent">
            <Logo size={28} />
            <div className="flex-1 leading-tight">
              <p className="text-sm font-bold">Avi</p>
              <p className="text-[11px] text-muted-foreground">Tu asistente en la emergencia</p>
            </div>
            <button onClick={() => setOpen(false)} className="size-7 rounded-full hover:bg-muted text-muted-foreground" title="Cerrar" aria-label="Cerrar chat">✕</button>
          </div>
          <ChatPanel className="flex-1 min-h-0" prefill={prefill} />
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)}
        className="size-14 rounded-full bg-primary text-white text-2xl shadow-lg hover:opacity-90 active:scale-95 transition outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title="Avi — chat" aria-label={open ? "Cerrar chat" : "Abrir chat"} aria-expanded={open} aria-haspopup="dialog">
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
