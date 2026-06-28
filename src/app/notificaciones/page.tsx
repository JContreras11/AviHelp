import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { Notificaciones } from "@/components/Notificaciones";

export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const s = await getSesion();
  if (!s) redirect("/login?next=/notificaciones");
  return (
    <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Notificaciones</h1>
      <p className="text-sm text-muted-foreground mb-6">Toca una alerta para ver el detalle y darle seguimiento.</p>
      <Notificaciones />
    </main>
  );
}
