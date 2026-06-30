import Link from "next/link";
import { notFound } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { getDonacionPublica } from "@/app/actions/entregas";
import RecibirEntrega from "./RecibirEntrega";

export const dynamic = "force-dynamic";

// Confirmación de RECEPCIÓN por personal del hospital habilitado (con foto, hora, lugar).
export default async function RecibirPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const [sesion, d] = await Promise.all([getSesion(), getDonacionPublica(codigo)]);
  if (!d) notFound();

  if (!sesion) {
    return (
      <main className="min-h-screen px-4 py-10 max-w-md mx-auto w-full text-center flex flex-col gap-3">
        <h1 className="text-xl font-bold">Confirmar recepción</h1>
        <p className="text-sm text-muted-foreground">Solo el personal del hospital puede confirmar que recibió la donación <span className="font-mono">{codigo}</span>.</p>
        <Link href={`/login?next=/donaciones/recibir/${codigo}`} className="text-primary underline">Inicia sesión para continuar</Link>
        <Link href={`/donaciones/${codigo}`} className="text-sm text-muted-foreground underline">Ver estado público</Link>
      </main>
    );
  }

  if (d.estado === "recibido") {
    return (
      <main className="min-h-screen px-4 py-10 max-w-md mx-auto w-full text-center flex flex-col gap-3">
        <span className="text-3xl">✅</span>
        <h1 className="text-xl font-bold">Ya estaba confirmada</h1>
        <p className="text-sm text-muted-foreground">La donación <span className="font-mono">{codigo}</span> ya fue marcada como recibida.</p>
        <Link href={`/donaciones/${codigo}`} className="text-primary underline">Ver detalle</Link>
      </main>
    );
  }

  return <RecibirEntrega codigo={codigo} d={d} />;
}
