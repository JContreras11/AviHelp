"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Building2, Users, ClipboardList, LogOut, CircleUser, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRol } from "@/lib/rol";

const ROL_LABEL: Record<string, string> = {
  admin: "Admin", medico: "Médico", voluntario: "Voluntario", ong: "ONG", publico: "Público",
};
// Color por rol para reconocer de un vistazo quién está conectado.
const ROL_PILL: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700",
  medico: "bg-sky-100 text-sky-700",
  voluntario: "bg-amber-100 text-amber-700",
  ong: "bg-pink-100 text-pink-700",
  publico: "bg-muted text-muted-foreground",
};

const item = "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-muted text-left";

export function UserMenu() {
  const router = useRouter();
  const { rol, email, nombre, coordinador, impersonando } = useRol();
  const primer = (nombre ?? email ?? "Cuenta").split(" ")[0];
  const rolLabel = ROL_LABEL[rol] ?? rol;
  const pill = ROL_PILL[rol] ?? ROL_PILL.publico;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierra al hacer click fuera (mismo patrón que NotificationBell, ya probado).
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function salir() {
    setOpen(false);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  // Visitante anónimo (entrada pública): solo ofrecer "Entrar".
  if (!email) {
    return <Link href="/login" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Entrar</Link>;
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Cuenta"
        className={`flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted text-sm ${impersonando ? "ring-1 ring-amber-400" : ""}`}>
        <CircleUser className="size-7 text-muted-foreground shrink-0" />
        {/* Escritorio: saludo + rol en dos líneas (quién está conectado, siempre visible). */}
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="font-medium max-w-[11rem] truncate">Hola, {primer}</span>
          <span className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${pill}`}>{rolLabel}</span>
            {impersonando && <span className="text-[10px] font-semibold text-amber-600">· viendo como</span>}
          </span>
        </span>
        {/* Móvil: solo el pill del rol junto al icono (la barra es estrecha). */}
        <span className={`sm:hidden px-1.5 py-0.5 rounded text-[10px] font-semibold ${pill}`}>{rolLabel}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-lg z-50 p-1">
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">Hola, {nombre ?? "Usuario"}</p>
            <p className="text-xs text-muted-foreground truncate">{email}</p>
            <p className="mt-1 flex items-center gap-1">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${pill}`}>{rolLabel}</span>
              {impersonando && <span className="text-[10px] font-semibold text-amber-600">👁️ viendo como</span>}
            </p>
          </div>
          <div className="h-px bg-border my-1" />
          {coordinador && (
            <Link href="/admin/triage" onClick={() => setOpen(false)} className={item}><Inbox className="size-4" /> Triage logístico</Link>
          )}
          {rol === "admin" && (
            <>
              <Link href="/admin/instituciones" onClick={() => setOpen(false)} className={item}><Building2 className="size-4" /> Instituciones</Link>
              <Link href="/admin/usuarios" onClick={() => setOpen(false)} className={item}><Users className="size-4" /> Usuarios</Link>
              <Link href="/admin/log" onClick={() => setOpen(false)} className={item}><ClipboardList className="size-4" /> Bitácora</Link>
              <div className="h-px bg-border my-1" />
            </>
          )}
          <button onClick={salir} className={item}><LogOut className="size-4" /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
