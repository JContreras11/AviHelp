import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { listarUsuarios } from "@/app/actions/usuarios";
import { Impersonar } from "@/components/admin/Impersonar";

export const dynamic = "force-dynamic";

export default async function ImpersonarPage() {
  const s = await getSesion();
  if (s?.rol !== "admin") redirect("/");
  const usuarios = await listarUsuarios();
  return (
    <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Ver como usuario</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Entra a la vista de otro usuario para revisar lo que ve y hacer solicitudes por él. Podrás volver a tu cuenta en cualquier momento. Solo administradores.
      </p>
      <Impersonar usuarios={usuarios as any[]} />
    </main>
  );
}
