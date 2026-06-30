import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerSolicitudPublica } from "@/app/actions/solicitudes";
import { SolicitudPublica } from "@/components/solicitud/SolicitudPublica";
import { tituloCompacto, abreviarInstitucion } from "@/lib/share";

export const dynamic = "force-dynamic";

// Página PÚBLICA por solicitud (slug). Para difundir en redes / chats de ONG.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sol = await obtenerSolicitudPublica(id);
  if (!sol) return { title: "Solicitud no encontrada — AviHelp" };
  const n = sol.insumos?.length ?? 0;
  const centro = sol.hospitales?.nombre ?? null;
  // Título compacto y legible en previews (truncan fuerte): centro abreviado + insumos.
  const compacto = tituloCompacto(centro, sol.insumos);
  const tituloPagina = centro ? `Solicitud de insumos — ${abreviarInstitucion(centro)}` : "Solicitud de insumos";
  const desc = sol.descripcion || `${n} necesidad${n === 1 ? "" : "es"} que puedes ayudar a cubrir. Dona directo desde aquí.`;
  return {
    title: `${tituloPagina} — AviHelp`,
    description: desc,
    openGraph: { title: compacto, description: desc },
    twitter: { card: "summary_large_image", title: compacto, description: desc },
  };
}

export default async function SolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sol = await obtenerSolicitudPublica(id);
  if (!sol) notFound();
  return <main className="flex-1"><SolicitudPublica sol={sol as any} /></main>;
}
