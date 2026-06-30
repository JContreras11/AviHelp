import { ImageResponse } from "next/og";
import { BrandOG, ogSize, ogContentType } from "@/lib/og";

export const alt = "AviHelp — Ayuda humanitaria con IA";
export const size = ogSize;
export const contentType = ogContentType;

export default function OG() {
  return new ImageResponse(
    (
      <BrandOG
        title="Coordina ayuda médica en emergencias"
        subtitle="Registra personas e insumos con una foto o tu voz."
      />
    ),
    { ...size },
  );
}
