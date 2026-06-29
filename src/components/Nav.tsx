"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import { useRol } from "@/lib/rol";

// Enlaces de navegación. En escritorio van inline; en móvil entran al menú hamburguesa.
const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/ofrecer", label: "Donar 💜" },
  { href: "/mis-donaciones", label: "Mis donaciones" },
  { href: "/mis-cargas", label: "Mis cargas" },
  { href: "/desaparecidos", label: "Desaparecidos" },
  { href: "/refugios", label: "Refugios" },
  { href: "/dashboard", label: "Panel" },
  { href: "/chat", label: "Avi" },
];
// Visitante sin cuenta: Inicio, Donar, Avi + refugios/desaparecidos (solo ver/buscar).
const PUB_HREFS = new Set(["/", "/ofrecer", "/chat", "/desaparecidos", "/refugios"]);

export function Nav() {
  const { email } = useRol();
  const links = email ? LINKS : LINKS.filter((l) => PUB_HREFS.has(l.href));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <nav className="flex items-center gap-1 text-sm">
      {/* Escritorio: enlaces inline */}
      <div className="hidden sm:flex items-center gap-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="px-2.5 py-1.5 rounded-lg hover:bg-muted">{l.label}</Link>
        ))}
      </div>

      {email && <NotificationBell />}
      <UserMenu />

      {/* Móvil: enlaces dentro de una hamburguesa */}
      <div className="relative sm:hidden" ref={ref}>
        <button onClick={() => setOpen((v) => !v)} aria-label="Menú"
          className="flex items-center justify-center size-9 rounded-lg hover:bg-muted">
          <Menu className="size-5" />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-card shadow-lg z-50 p-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm rounded-md hover:bg-muted">{l.label}</Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
