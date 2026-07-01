"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { preguntar, transcribirVoz } from "@/app/actions/chat";
import { useRol } from "@/lib/rol";

export type Msg = { rol: "user" | "bot"; texto: string; insumos?: any[]; resultados?: any[]; archivo?: { nombre: string; formato: string } };

// Tips útiles por rol: enseñan a usar a Avi. Se eligen al azar (saludo + nudge inactivo).
const TIPS: Record<string, string[]> = {
  publico: [
    "Puedes preguntarme «¿qué insumos faltan?» y te muestro las necesidades de los hospitales.",
    "¿Buscas a alguien? Escríbeme su nombre y reviso hospitales y registros públicos.",
    "Si quieres ayudar, pregúntame «¿cómo dono?» y te guío paso a paso.",
    "Pregúntame por un refugio o dónde entregar ayuda; también te paso el mapa.",
  ],
  ong: [
    "Dime «¿qué insumos faltan?» y te muestro qué donar y a qué hospital.",
    "Escríbeme un insumo (ej. «guantes») y te digo quién lo necesita ahora.",
    "¿Listo para donar? Pregúntame «¿cómo ofrezco ayuda?».",
  ],
  voluntario: [
    "Pregúntame por el estado de una solicitud o «insumos pendientes».",
    "Puedo mostrarte lo de tus instituciones: dime «qué falta en mi hospital».",
    "Tip: dime un insumo y te digo su estatus (pendiente / en camino / recibido).",
  ],
  medico: [
    "Pídeme «responsable del hospital X» o «qué falta en El Llanito».",
    "Busca un paciente por nombre o cédula y te digo en qué centro está.",
    "Pregúntame por cualquier hospital: ubicación, responsable y necesidades.",
  ],
  admin: [
    "Pídeme «responsable de [hospital]», «qué falta en [centro]» o busca a una persona.",
    "Puedo darte datos de cualquier institución: responsables, contactos y necesidades.",
    "Dime un insumo y te muestro quién lo pide y su estatus.",
  ],
};
const tipsDe = (rol: string) => TIPS[rol] ?? TIPS.publico;
function tipRandom(rol: string, evitar?: string) {
  const opts = tipsDe(rol).filter((t) => t !== evitar);
  return opts[Math.floor(Math.random() * opts.length)] ?? tipsDe(rol)[0];
}
// `tip` explícito = saludo determinista (para SSR/primer render: evita hydration
// mismatch React #418). Sin tip cae al primer tip (índice 0), no a Math.random.
function saludoInicial(rol: string, nombre: string | null, tip?: string): Msg {
  const hola = nombre ? `¡Hola, ${nombre.split(" ")[0]}! ` : "¡Hola! ";
  return { rol: "bot", texto: `${hola}Soy Avi 💜 ${tip ?? tipsDe(rol)[0]}` };
}

type ChatCtx = {
  msgs: Msg[];
  cargando: boolean;
  grabando: boolean;
  enviar: (q: string) => Promise<void>;
  toggleMic: (onTexto: (t: string) => void) => Promise<void>;
  subirArchivos: (files: File[]) => void;
  limpiar: () => void;
  nudge: () => void;
};
const Ctx = createContext<ChatCtx>({
  msgs: [], cargando: false, grabando: false,
  enviar: async () => {}, toggleMic: async () => {}, subirArchivos: () => {}, limpiar: () => {}, nudge: () => {},
});

// Una sola conversación compartida por la página /chat y el widget flotante.
// Vive en el layout (persiste al navegar) + localStorage (persiste al recargar).
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { rol, nombre, email } = useRol();
  const currentKey = email ? `avihelp-chat-${email}` : "avihelp-chat-publico";

  const [msgs, setMsgs] = useState<Msg[]>(() => [saludoInicial(rol, nombre)]);
  const [cargando, setCargando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  // Estado de una creación en curso (gather multi-turno de Avi): viaja de ida/vuelta
  // con cada mensaje para que Avi recuerde insumos + centro y termine la solicitud/donación.
  const pendiente = useRef<any>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(currentKey);
      if (s) {
        const m = JSON.parse(s);
        if (Array.isArray(m) && m.length) {
          setMsgs(m);
          return;
        }
      }
    } catch {}
    // Sin historial: ya montados en cliente, randomizamos el tip (no rompe hydration).
    setMsgs([saludoInicial(rol, nombre, tipRandom(rol))]);
  }, [currentKey, rol, nombre]);

  useEffect(() => {
    try {
      localStorage.setItem(currentKey, JSON.stringify(msgs.slice(-50)));
    } catch {}
  }, [msgs, currentKey]);

  async function enviar(qRaw: string) {
    const q = qRaw.trim();
    if (!q || cargando) return;
    setMsgs((m) => [...m, { rol: "user", texto: q }]);
    setCargando(true);
    try {
      const { respuesta, insumos, resultados, pendiente: pend } = await preguntar(q, pendiente.current);
      pendiente.current = pend ?? null; // recuerda (o limpia) la creación en curso
      setMsgs((m) => [...m, { rol: "bot", texto: respuesta, insumos: insumos?.length ? insumos : undefined, resultados: resultados?.length ? resultados : undefined }]);
    } catch {
      setMsgs((m) => [...m, { rol: "bot", texto: "Error consultando. Intenta de nuevo." }]);
    } finally {
      setCargando(false);
    }
  }

  async function toggleMic(onTexto: (t: string) => void) {
    if (grabando) { rec.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = async () => {
        setGrabando(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType });
        if (blob.size < 800) return;
        const fd = new FormData();
        fd.append("audio", blob, `audio.${(mr.mimeType.split("/")[1] ?? "webm").split(";")[0]}`);
        setCargando(true);
        try { const t = await transcribirVoz(fd); if (t.trim()) onTexto(t.trim()); } finally { setCargando(false); }
      };
      rec.current = mr;
      mr.start();
      setGrabando(true);
    } catch { /* permiso denegado */ }
  }

  // Adjuntar archivos por el chat: muestra un chip "📄 subido" arriba y manda el archivo
  // al pipeline de Captura (que lo lee y muestra el preview editable).
  function subirArchivos(files: File[]) {
    if (!files.length) return;
    setMsgs((m) => [
      ...m,
      ...files.map((f) => ({ rol: "user" as const, texto: "", archivo: { nombre: f.name, formato: (f.name.split(".").pop() || "archivo").toUpperCase() } })),
      { rol: "bot" as const, texto: "Recibido 📄 — lo estoy leyendo. Aquí abajo verás una tarjeta con lo que extraje: revísala y pulsa **Guardar**. Cuando la guardes, quedará registrada y la verás en /mis-cargas." },
    ]);
    window.dispatchEvent(new CustomEvent("avi-cargar", { detail: files }));
  }

  const limpiar = () => { pendiente.current = null; setMsgs([saludoInicial(rol, nombre)]); };

  // Nudge proactivo (inactividad): añade un tip al azar, pero no insiste:
  // máximo 1 mensaje del bot encima de lo último que dijo el usuario.
  function nudge() {
    if (cargando) return;
    setMsgs((m) => {
      let botsAlFinal = 0;
      for (let i = m.length - 1; i >= 0 && m[i].rol === "bot"; i--) botsAlFinal++;
      if (botsAlFinal >= 2) return m; // ya saludó/insistió; espera a que el usuario hable
      return [...m, { rol: "bot", texto: tipRandom(rol, m[m.length - 1]?.texto) }];
    });
  }

  return <Ctx.Provider value={{ msgs, cargando, grabando, enviar, toggleMic, subirArchivos, limpiar, nudge }}>{children}</Ctx.Provider>;
}

export const useChat = () => useContext(Ctx);
