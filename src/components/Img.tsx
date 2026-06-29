"use client";

import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import { urlFoto } from "@/lib/media";

// Imagen con click + zoom (pellizcar en móvil). Acepta dataURL, http o path de Storage.
export function Img({
  src,
  alt,
  className = "",
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const url = urlFoto(src);
  if (!url) return null;
  // Fallback de alt: nunca queda sin texto alternativo (lectores anuncian "Imagen adjunta").
  return (
    <Zoom>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt?.trim() ? alt : "Imagen adjunta"} className={className} />
    </Zoom>
  );
}
