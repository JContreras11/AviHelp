"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRol } from "@/lib/rol";
import { Button } from "@/components/ui/button";

const ROL_LABEL: Record<string, string> = {
  admin: "🛡️ Admin", medico: "🩺 Médico", voluntario: "🙋 Voluntario", ong: "🤝 ONG", publico: "👁️ Público",
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
    <div className="flex items-center gap-2 pl-1">
      {rol === "admin" && (<>
        <Link href="/admin/instituciones" className="px-2.5 py-1.5 rounded-lg hover:bg-muted" title="Instituciones">🏥</Link>
        <Link href="/admin/usuarios" className="px-2.5 py-1.5 rounded-lg hover:bg-muted" title="Gestión de usuarios">👤</Link>
      </>)}
      <span className="hidden sm:flex flex-col text-right leading-tight">
        <span className="text-xs font-medium">{nombre ?? email}</span>
        <span className="text-[10px] text-muted-foreground">{ROL_LABEL[rol] ?? rol}</span>
      </span>
      <Button variant="outline" size="sm" onClick={salir} title="Cerrar sesión">Salir</Button>
    </div>
  );
}
