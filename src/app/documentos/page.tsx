import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/supabase/server";
import { Captura } from "@/components/Captura";

export const dynamic = "force-dynamic";

// Módulo de CARGA DE DOCUMENTOS: punto único para subir fotos, PDF, Excel, Word, QR,
// texto o voz. La IA clasifica cada documento y genera tarjetas revisables antes de guardar.
export default async function DocumentosPage() {
  const s = await getSesion();
  if (!s) redirect("/login");

  return (
    <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">← Inicio</Link>
        <Link href="/mis-cargas" className="text-sm font-medium text-primary hover:underline">📂 Ver mis cargas →</Link>
      </div>
      <h1 className="text-2xl font-bold mt-2 mb-1">Cargar documentos</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Sube una foto, PDF, Excel, Word, un QR o dicta una nota. La IA detecta si es una lista de
        personas o de insumos, la estructura y te deja revisar y corregir antes de guardar.
      </p>
      <Captura />
    </main>
  );
}
