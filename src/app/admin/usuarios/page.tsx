import { redirect } from "next/navigation";
import { getSesion, createAdminClient } from "@/lib/supabase/server";
import { listarUsuarios } from "@/app/actions/usuarios";
import { Usuarios } from "@/components/admin/Usuarios";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const s = await getSesion();
  if (s?.rol !== "admin") redirect("/");

  const [usuarios, { data: hospitales }] = await Promise.all([
    listarUsuarios(),
    createAdminClient().from("hospitales").select("id,nombre").order("nombre"),
  ]);

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Usuarios</h1>
      <p className="text-sm text-muted-foreground mb-6">Gestión de cuentas y roles. Solo administradores.</p>
      <Usuarios inicial={usuarios} hospitales={hospitales ?? []} />
    </main>
  );
}
