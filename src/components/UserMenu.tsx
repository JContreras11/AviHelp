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

const item = "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-muted text-left";

export function UserMenu() {
  const router = useRouter();
  const { rol, email, nombre, coordinador } = useRol();
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

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Cuenta"
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted text-sm">
        <CircleUser className="size-5 sm:hidden" />
        <span className="hidden sm:inline max-w-[10rem] truncate font-medium">{nombre ?? email ?? "Cuenta"}</span>
        <ChevronDown className={`hidden sm:inline-block size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-lg z-50 p-1">
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{nombre ?? "Usuario"}</p>
            <p className="text-xs text-muted-foreground truncate">{[email, ROL_LABEL[rol] ?? rol].filter(Boolean).join(" · ")}</p>
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
