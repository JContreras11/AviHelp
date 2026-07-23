"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import { DonarNav } from "@/components/donaciones/DonarNav";
import { useRol } from "@/lib/rol";

// Enlaces de navegación. En escritorio van inline; en móvil entran al menú hamburguesa.
// `gate`: sin gate = todo usuario con sesión · "admin" = solo admin · "logistica" = admin/centro/ONG (acopio y aliados).
// Las páginas se auto-protegen server-side; el gate aquí solo evita mostrar links que rebotarían.
const LINKS: { href: string; label: string; gate?: "admin" | "logistica" }[] = [
  { href: "/", label: "Inicio" },
  { href: "/donaciones/crear", label: "Donar 💜" },
  { href: "/solicitudes", label: "Solicitudes" },
  { href: "/donaciones", label: "Mis donaciones" },
  { href: "/documentos", label: "Cargar 📄" },
  { href: "/mis-cargas", label: "Mis cargas" },
  { href: "/checkin", label: "Recepción", gate: "logistica" },
  { href: "/inventario", label: "Inventario", gate: "logistica" },
  { href: "/inspeccion", label: "Inspección", gate: "logistica" },
  { href: "/despacho", label: "Despacho", gate: "logistica" },
  { href: "/camiones", label: "Camiones", gate: "logistica" },
  { href: "/calendario", label: "Calendario", gate: "logistica" },
  { href: "/vencimientos", label: "Vencimientos", gate: "logistica" },
  { href: "/gastos", label: "Gastos", gate: "logistica" },
  { href: "/admin/categorias", label: "Categorías", gate: "admin" },
  { href: "/desaparecidos", label: "Desaparecidos" },
  { href: "/refugios", label: "Centros" },
  { href: "/dashboard", label: "Panel" },
  { href: "/chat", label: "Avi" },
  { href: "/publico", label: "Estado" },
  { href: "/ayuda", label: "Ayuda ❓" }, // AGENT H: enlace ADITIVO a la guía completa (público)
];
// Visitante sin cuenta: Inicio, Donar, Avi + refugios/desaparecidos (solo ver/buscar) + Ayuda.
const PUB_HREFS = new Set(["/", "/donaciones/crear", "/chat", "/desaparecidos", "/refugios", "/publico", "/ayuda"]);

export function Nav() {
  const { email, rol, donante } = useRol();
  const links = (email ? LINKS : LINKS.filter((l) => PUB_HREFS.has(l.href)))
    .filter((l) => !l.gate || (l.gate === "admin" ? rol === "admin" : donante));
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
          l.href === "/donaciones/crear" && email
            ? <DonarNav key={l.href} label={l.label} className="px-2.5 py-1.5 rounded-lg hover:bg-muted" />
            : <Link key={l.href} href={l.href} className="px-2.5 py-1.5 rounded-lg hover:bg-muted">{l.label}</Link>
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
              l.href === "/donaciones/crear" && email
                ? <DonarNav key={l.href} label={l.label} className="block px-3 py-2 text-sm rounded-md hover:bg-muted w-full text-left" onNavigate={() => setOpen(false)} />
                : <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm rounded-md hover:bg-muted">{l.label}</Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
