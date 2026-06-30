import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { QrSticker } from "@/components/QrSticker";
import { tituloCompacto, abreviarInstitucion } from "@/lib/share";

export const dynamic = "force-dynamic";

const PRIO = { critica: 0, alta: 1, media: 2, baja: 3 } as const;

async function cargar(id: string) {
  const a = createAdminClient();
  const [{ data: hospital }, { data: insumos }] = await Promise.all([
    a.from("hospitales").select("nombre, ubicacion, tipo, responsable_recepcion_nombre, responsable_recepcion_contacto").eq("id", id).maybeSingle(),
    a.from("insumos").select("nombre, cantidad, unidad, presentacion, area, prioridad")
      .eq("hospital_id", id).in("estado", ["solicitado", "en_transito"]).limit(100),
  ]);
  const orden = (insumos ?? []).sort((x: any, y: any) => (PRIO[x.prioridad as keyof typeof PRIO] ?? 9) - (PRIO[y.prioridad as keyof typeof PRIO] ?? 9));
  return { hospital, insumos: orden };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { hospital, insumos } = await cargar(id);
  if (!hospital) return { title: "AviHelp" };
  // Título compacto sin emoji inicial (las previews truncan fuerte).
  const titulo = tituloCompacto(hospital.nombre, insumos);
  const centro = abreviarInstitucion(hospital.nombre);
  const desc = insumos.length
    ? `${centro} tiene ${insumos.length} necesidad(es) activas. Ayuda a cubrirlas o compártelo. — AviHelp`
    : `Apoya a ${centro}. — AviHelp`;
  return {
    title: titulo,
    description: desc,
    openGraph: { title: titulo, description: desc, type: "website" },
    twitter: { card: "summary_large_image", title: titulo, description: desc },
  };
}

export default async function CompartirHospital({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hospital, insumos } = await cargar(id);
  if (!hospital) notFound();

  const tieneResp = hospital.responsable_recepcion_nombre || hospital.responsable_recepcion_contacto;

  return (
    <main className="min-h-screen px-4 py-8 max-w-lg mx-auto w-full flex flex-col gap-5">
      <header className="text-center">
        <p className="text-3xl mb-1">🚨</p>
        <h1 className="text-2xl font-bold leading-tight">{hospital.nombre}</h1>
        {hospital.ubicacion && <p className="text-sm text-muted-foreground">📍 {hospital.ubicacion}</p>}
      </header>

      <section className="rounded-2xl border p-4">
        <p className="font-semibold mb-2">Necesidades actuales ({insumos.length})</p>
        {insumos.length === 0 && <p className="text-sm text-muted-foreground">Sin necesidades activas ahora mismo.</p>}
        <ul className="flex flex-col gap-1.5">
          {insumos.slice(0, 12).map((i: any, k: number) => (
            <li key={k} className="flex items-center justify-between gap-2 border-b last:border-0 py-1 text-sm">
              <span className="min-w-0 truncate">{i.nombre}{i.presentacion ? ` · ${i.presentacion}` : ""}{i.cantidad ? ` (${i.cantidad}${i.unidad ? " " + i.unidad : ""})` : ""}</span>
              {(i.prioridad === "critica" || i.prioridad === "alta") && <span className="shrink-0 text-xs font-semibold text-red-600">{i.prioridad}</span>}
            </li>
          ))}
        </ul>
        {insumos.length > 12 && <p className="text-xs text-muted-foreground mt-2">y {insumos.length - 12} más…</p>}
      </section>

      <div className="flex flex-col gap-2">
        <Link href={`/donaciones/crear?hospital=${id}`}><Button size="lg" className="w-full">💜 Quiero ayudar / donar</Button></Link>
        {tieneResp && hospital.responsable_recepcion_contacto && (
          <a href={`tel:${hospital.responsable_recepcion_contacto}`}>
            <Button size="lg" variant="outline" className="w-full">📞 Contactar al responsable</Button>
          </a>
        )}
      </div>

      <QrSticker titulo={`Escanea para ayudar a ${hospital.nombre}`} />

      <p className="text-center text-xs text-muted-foreground">AviHelp — puente de comunicación en la emergencia.</p>
    </main>
  );
}
