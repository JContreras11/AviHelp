"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ChevronDown } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import { DonarNav } from "@/components/donaciones/DonarNav";
import { useRol } from "@/lib/rol";

// gate: sin gate = cualquier usuario con sesión · "admin" = solo admin ·
//       "coord" = admin o miembro de hospital · "logistica" = admin/ONG/centro.
// pub = visible también para visitantes sin cuenta.
type Gate = "admin" | "coord" | "logistica";
type Leaf = { href: string; label: string; gate?: Gate; pub?: boolean };
type Group = { label: string; items: Leaf[]; gate?: Gate };

// Grupos (dropdown en escritorio, sección en móvil). Agrupados por entidad.
// Inicio, Donar, Panel, Avi y Ayuda van sueltos en el render (abajo).
const GROUPS: Group[] = [
  { label: "Acopio", gate: "logistica", items: [
    { href: "/checkin", label: "Recepción" },
    { href: "/inspeccion", label: "Inspección" },
    { href: "/inventario", label: "Inventario" },
    { href: "/despacho", label: "Despacho" },
    { href: "/vencimientos", label: "Vencimientos" },
    { href: "/gastos", label: "Gastos y cuentas" },
  ] },
  { label: "Transporte", gate: "logistica", items: [
    { href: "/camiones", label: "Camiones" },
    { href: "/calendario", label: "Calendario" },
    { href: "/cronograma", label: "Cronograma médico" },
  ] },
  { label: "Voluntarios", items: [
    { href: "/voluntarios", label: "Roster de voluntarios", gate: "logistica" },
    { href: "/voluntarios/registro", label: "Formulario de registro", pub: true },
  ] },
  { label: "Comunidad", items: [
    { href: "/solicitudes", label: "Solicitudes" },
    { href: "/desaparecidos", label: "Desaparecidos", pub: true },
    { href: "/refugios", label: "Centros", pub: true },
    { href: "/publico", label: "Estado de la emergencia", pub: true },
  ] },
  { label: "Mis aportes", items: [
    { href: "/donaciones", label: "Mis donaciones" },
    { href: "/documentos", label: "Cargar documento" },
    { href: "/mis-cargas", label: "Mis cargas" },
  ] },
  { label: "Admin", gate: "admin", items: [
    { href: "/admin/categorias", label: "Categorías" },
    { href: "/admin/instituciones", label: "Instituciones" },
    { href: "/admin/usuarios", label: "Usuarios" },
    { href: "/admin/triage", label: "Triage logístico", gate: "coord" },
    { href: "/admin/log", label: "Bitácora" },
  ] },
];

export function Nav() {
  const { email, rol, donante, coordinador } = useRol();
  const pathname = usePathname();

  const can = (x: { gate?: Gate; pub?: boolean }) => {
    if (!email) return !!x.pub;
    if (!x.gate) return true;
    if (x.gate === "admin") return rol === "admin";
    if (x.gate === "coord") return coordinador;
    return donante; // logistica
  };
  // Un grupo se muestra si pasa su propio GATE (no la regla pub, que es por ítem)
  // y tiene al menos un ítem visible. Así un grupo sin gate con ítems públicos
  // aparece para visitantes anónimos.
  const visibleGroups = GROUPS
    .filter((g) => !g.gate || can({ gate: g.gate }))
    .map((g) => ({ ...g, items: g.items.filter(can) }))
    .filter((g) => g.items.length > 0);

  const [openMenu, setOpenMenu] = useState<string | null>(null); // dropdown de escritorio abierto
  const [hamOpen, setHamOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierra dropdowns/hamburguesa al hacer click fuera o cambiar de ruta.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpenMenu(null); setHamOpen(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { setOpenMenu(null); setHamOpen(false); }, [pathname]);

  const activo = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));
  const linkCls = (href: string) =>
    `px-2.5 py-1.5 rounded-lg hover:bg-muted whitespace-nowrap ${activo(href) ? "text-primary font-medium" : ""}`;

  return (
    <nav className="flex items-center gap-1 text-sm" ref={ref}>
      {/* ── Escritorio (lg+): enlaces sueltos + dropdowns agrupados ── */}
      <div className="hidden lg:flex items-center gap-0.5">
        <Link href="/" className={linkCls("/")}>Inicio</Link>
        {email && <DonarNav label="Donar 💜" className={linkCls("/donaciones/crear")} />}
        {!email && <Link href="/donaciones/crear" className={linkCls("/donaciones/crear")}>Donar 💜</Link>}
        {email && <Link href="/dashboard" className={linkCls("/dashboard")}>Panel</Link>}

        {visibleGroups.map((g) => {
          const abierto = openMenu === g.label;
          const grpActivo = g.items.some((i) => activo(i.href));
          return (
            <div key={g.label} className="relative">
              <button
                onClick={() => setOpenMenu(abierto ? null : g.label)}
                aria-expanded={abierto}
                className={`flex items-center gap-0.5 px-2.5 py-1.5 rounded-lg hover:bg-muted whitespace-nowrap ${grpActivo ? "text-primary font-medium" : ""}`}
              >
                {g.label}
                <ChevronDown className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
              </button>
              {abierto && (
                <div className="absolute left-0 mt-1 w-52 rounded-xl border bg-card shadow-lg z-50 p-1">
                  {g.items.map((i) => (
                    <Link key={i.href} href={i.href} onClick={() => setOpenMenu(null)}
                      className={`block px-3 py-2 rounded-md hover:bg-muted ${activo(i.href) ? "text-primary font-medium" : ""}`}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <Link href="/chat" className={linkCls("/chat")}>Avi</Link>
        <Link href="/ayuda" className={linkCls("/ayuda")}>Ayuda</Link>
      </div>

      {email && <NotificationBell />}
      <UserMenu />

      {/* ── Móvil/tablet (<lg): hamburguesa con secciones agrupadas ── */}
      <div className="relative lg:hidden">
        <button onClick={() => setHamOpen((v) => !v)} aria-label="Menú" aria-expanded={hamOpen}
          className="flex items-center justify-center size-9 rounded-lg hover:bg-muted">
          <Menu className="size-5" />
        </button>
        {hamOpen && (
          <div className="absolute right-0 mt-2 w-64 max-h-[80vh] overflow-y-auto rounded-xl border bg-card shadow-lg z-50 p-2">
            {/* sueltos */}
            <Link href="/" onClick={() => setHamOpen(false)} className={`block px-3 py-2 rounded-md hover:bg-muted ${activo("/") ? "text-primary font-medium" : ""}`}>Inicio</Link>
            {email
              ? <DonarNav label="Donar 💜" className="block px-3 py-2 rounded-md hover:bg-muted w-full text-left" onNavigate={() => setHamOpen(false)} />
              : <Link href="/donaciones/crear" onClick={() => setHamOpen(false)} className="block px-3 py-2 rounded-md hover:bg-muted">Donar 💜</Link>}
            {email && <Link href="/dashboard" onClick={() => setHamOpen(false)} className={`block px-3 py-2 rounded-md hover:bg-muted ${activo("/dashboard") ? "text-primary font-medium" : ""}`}>Panel</Link>}

            {visibleGroups.map((g) => (
              <div key={g.label} className="mt-2 pt-2 border-t">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} onClick={() => setHamOpen(false)}
                    className={`block px-3 py-2 rounded-md hover:bg-muted ${activo(i.href) ? "text-primary font-medium" : ""}`}>
                    {i.label}
                  </Link>
                ))}
              </div>
            ))}

            <div className="mt-2 pt-2 border-t">
              <Link href="/chat" onClick={() => setHamOpen(false)} className="block px-3 py-2 rounded-md hover:bg-muted">Avi</Link>
              <Link href="/ayuda" onClick={() => setHamOpen(false)} className="block px-3 py-2 rounded-md hover:bg-muted">Ayuda</Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
