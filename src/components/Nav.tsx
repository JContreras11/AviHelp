"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// Enlaces de navegación. En escritorio van inline; en móvil entran al menú hamburguesa.
const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/refugios", label: "Refugios" },
  { href: "/dashboard", label: "Panel" },
  { href: "/chat", label: "Avi" },
];

export function Nav() {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {/* Escritorio: enlaces inline */}
      <div className="hidden sm:flex items-center gap-1">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="px-2.5 py-1.5 rounded-lg hover:bg-muted">{l.label}</Link>
        ))}
      </div>

      <NotificationBell />
      <UserMenu />

      {/* Móvil: enlaces dentro de una hamburguesa */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="sm:hidden flex items-center justify-center size-9 rounded-lg hover:bg-muted"
          aria-label="Menú">
          <Menu className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {LINKS.map((l) => (
            <DropdownMenuItem key={l.href} render={<Link href={l.href} />}>{l.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
