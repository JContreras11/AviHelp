import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerSolicitudPublica } from "@/app/actions/solicitudes";
import { SolicitudPublica } from "@/components/solicitud/SolicitudPublica";

export const dynamic = "force-dynamic";

// Página PÚBLICA por solicitud (slug). Para difundir en redes / chats de ONG.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sol = await obtenerSolicitudPublica(id);
  if (!sol) return { title: "Solicitud no encontrada — AviHelp" };
  const n = sol.insumos?.length ?? 0;
  return {
    title: `${sol.titulo} — AviHelp`,
    description: sol.descripcion || `${n} necesidad${n === 1 ? "" : "es"} que puedes ayudar a cubrir. Dona directo desde aquí.`,
    openGraph: { title: sol.titulo, description: sol.descripcion || "Ayuda a cubrir estas necesidades médicas." },
  };
}

export default async function SolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sol = await obtenerSolicitudPublica(id);
  if (!sol) notFound();
  return <main className="flex-1"><SolicitudPublica sol={sol as any} /></main>;
}
