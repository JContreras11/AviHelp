import { ImageResponse } from "next/og";
import { getDonacionPublica } from "@/app/actions/entregas";
import { BrandOG, ogSize, ogContentType } from "@/lib/og";
import { recortar } from "@/lib/share";

export const alt = "Estado de una donación — AviHelp";
export const size = ogSize;
export const contentType = ogContentType;

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Registrada",
  en_transito: "En camino",
  recibido: "Recibida y confirmada",
  rechazado: "No recibida",
  cancelado: "Cancelada",
};

export default async function OG({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const d = await getDonacionPublica(codigo).catch(() => null);
  const que = recortar(d?.oferta?.descripcion ?? "", 30);
  const title = que ? `Donación · ${que}` : `Donación ${codigo}`;
  const estado = d ? ESTADO_LABEL[d.estado] ?? "en proceso" : "Sigue su trazabilidad";

  return new ImageResponse(
    <BrandOG badge={`Estado: ${estado}`} title={title} subtitle="Trazabilidad de la ayuda en AviHelp" />,
    { ...size },
  );
}
