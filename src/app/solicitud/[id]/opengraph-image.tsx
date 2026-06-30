import { ImageResponse } from "next/og";
import { obtenerSolicitudPublica } from "@/app/actions/solicitudes";
import { BrandOG, ogSize, ogContentType } from "@/lib/og";
import { tituloCompacto } from "@/lib/share";

export const alt = "Solicitud de insumos médicos — AviHelp";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sol = await obtenerSolicitudPublica(id).catch(() => null);
  const centro = sol?.hospitales?.nombre ?? null;
  const title = sol ? tituloCompacto(centro, sol.insumos) : "Solicitud de insumos médicos";
  const n = sol?.insumos?.length ?? 0;
  const subtitle = n ? `${n} necesidad${n === 1 ? "" : "es"} que puedes ayudar a cubrir` : "Ayuda a cubrir estas necesidades médicas";

  return new ImageResponse(
    <BrandOG badge="Solicitud de insumos" title={title} subtitle={subtitle} />,
    { ...size },
  );
}
