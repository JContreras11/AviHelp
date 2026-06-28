"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Building2, Users, ClipboardList, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRol } from "@/lib/rol";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const ROL_LABEL: Record<string, string> = {
  admin: "Admin", medico: "Médico", voluntario: "Voluntario", ong: "ONG", publico: "Público",
};

export function UserMenu() {
  const router = useRouter();
  const { rol, email, nombre } = useRol();

  async function salir() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-muted text-sm">
        <span className="max-w-[10rem] truncate font-medium">{nombre ?? email ?? "Cuenta"}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{nombre ?? "Usuario"}</span>
          <span className="text-xs font-normal text-muted-foreground truncate">{[email, ROL_LABEL[rol] ?? rol].filter(Boolean).join(" · ")}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {rol === "admin" && (
          <>
            <DropdownMenuItem render={<Link href="/admin/instituciones" />}><Building2 /> Instituciones</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/admin/usuarios" />}><Users /> Usuarios</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/admin/log" />}><ClipboardList /> Bitácora</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={salir}><LogOut /> Cerrar sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
